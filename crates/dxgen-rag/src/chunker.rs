use std::path::Path;

use sha2::{Digest, Sha256};

use crate::scanner::scan_project;
use crate::types::{FileChunk, FileChunkMetadata, RagOutput, ScannedFile};

const SEPARATORS: &[&str] = &["\n\n", "\n", " ", ""];

fn sha256(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn split_on_separator(text: &str, separator: &str) -> Vec<String> {
    if separator.is_empty() {
        return text.chars().map(|value| value.to_string()).collect();
    }

    let mut splits = Vec::new();
    let mut start = 0;
    for (index, _) in text
        .char_indices()
        .filter(|(index, _)| text[*index..].starts_with(separator))
    {
        if index > start {
            splits.push(text[start..index].to_string());
        }
        start = index;
    }
    if start < text.len() {
        splits.push(text[start..].to_string());
    }
    splits
}

fn js_len(value: &str) -> usize {
    value.encode_utf16().count()
}

fn merge_splits(splits: &[String], chunk_size: usize, chunk_overlap: usize) -> Vec<String> {
    let mut docs = Vec::new();
    let mut current = Vec::<String>::new();
    let mut total = 0;

    for split in splits {
        let length = js_len(split);
        if total + length > chunk_size && !current.is_empty() {
            let joined = current.concat().trim().to_string();
            if !joined.is_empty() {
                docs.push(joined);
            }
            while total > chunk_overlap || (total + length > chunk_size && total > 0) {
                total -= js_len(&current.remove(0));
            }
        }
        current.push(split.clone());
        total += length;
    }

    let joined = current.concat().trim().to_string();
    if !joined.is_empty() {
        docs.push(joined);
    }
    docs
}

fn split_text(
    text: &str,
    separators: &[&str],
    chunk_size: usize,
    chunk_overlap: usize,
) -> Vec<String> {
    let (separator_index, separator) = separators
        .iter()
        .enumerate()
        .find(|(_, separator)| separator.is_empty() || text.contains(**separator))
        .unwrap_or((separators.len() - 1, &""));
    let next =
        (separator_index + 1 < separators.len()).then_some(&separators[separator_index + 1..]);
    let mut final_chunks = Vec::new();
    let mut good_splits = Vec::new();

    for split in split_on_separator(text, separator) {
        if js_len(&split) < chunk_size {
            good_splits.push(split);
            continue;
        }
        if !good_splits.is_empty() {
            final_chunks.extend(merge_splits(&good_splits, chunk_size, chunk_overlap));
            good_splits.clear();
        }
        if let Some(next) = next {
            final_chunks.extend(split_text(&split, next, chunk_size, chunk_overlap));
        } else {
            final_chunks.push(split);
        }
    }
    if !good_splits.is_empty() {
        final_chunks.extend(merge_splits(&good_splits, chunk_size, chunk_overlap));
    }
    final_chunks
}

fn requires_utf16_fallback(text: &str, separators: &[&str], chunk_size: usize) -> bool {
    let (separator_index, separator) = separators
        .iter()
        .enumerate()
        .find(|(_, separator)| separator.is_empty() || text.contains(**separator))
        .unwrap_or((separators.len() - 1, &""));
    let next =
        (separator_index + 1 < separators.len()).then_some(&separators[separator_index + 1..]);
    if separator.is_empty()
        && js_len(text) >= chunk_size
        && text.chars().any(|value| value.len_utf16() == 2)
    {
        return true;
    }

    split_on_separator(text, separator)
        .into_iter()
        .any(|split| {
            js_len(&split) >= chunk_size
                && next.map_or_else(
                    || split.chars().any(|value| value.len_utf16() == 2),
                    |next| requires_utf16_fallback(&split, next, chunk_size),
                )
        })
}

fn metadata(
    file: &ScannedFile,
    chunk_index: usize,
    chunk_count: usize,
    text: &str,
    file_hash: &str,
    content_hash: &str,
    start: usize,
    found: bool,
) -> FileChunkMetadata {
    let lower = file.relative_path.to_lowercase();
    let extension = Path::new(&lower)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let is_readme =
        lower == "readme.md" || lower.ends_with("/readme.md") || lower.contains("/docs/");
    let is_env_example = Path::new(&lower)
        .file_name()
        .and_then(|value| value.to_str())
        == Some(".env.example");
    let is_ci_config = lower.starts_with(".github/workflows/")
        || lower.starts_with(".gitlab-ci")
        || lower.ends_with("/docker-compose.yml")
        || lower.ends_with("/docker-compose.yaml");
    let is_package_json = lower.ends_with("package.json");
    let file_type = if is_readme || matches!(extension, "md" | "mdx") {
        "docs"
    } else if matches!(extension, "json" | "yml" | "yaml") || lower.contains("config") {
        "config"
    } else if lower.contains("test") || lower.contains(".spec.") {
        "test"
    } else if matches!(
        extension,
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "py" | "go" | "rb" | "php"
    ) {
        "code"
    } else {
        "other"
    };
    let start_line = 1 + file.content[..start]
        .bytes()
        .filter(|value| *value == b'\n')
        .count();
    let end_line = if found {
        start_line + text.bytes().filter(|value| *value == b'\n').count()
    } else {
        start_line
    };

    FileChunkMetadata {
        source: file.full_path.clone(),
        relative_path: file.relative_path.clone(),
        file_hash: file_hash.to_string(),
        content_hash: content_hash.to_string(),
        chunk_index,
        chunk_count,
        start_line,
        end_line,
        file_type,
        is_config: file_type == "config" || is_package_json || is_env_example || is_ci_config,
        is_package_json,
        is_readme,
        is_env_example,
        is_ci_config,
    }
}

pub(crate) fn chunk_project(
    root: &Path,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Result<RagOutput, String> {
    if chunk_size == 0 || chunk_overlap >= chunk_size {
        return Err("chunk size must be positive and chunk overlap must be smaller".to_string());
    }
    let mut chunks = Vec::new();
    for file in scan_project(root)? {
        let file_hash = sha256(&file.content);
        if requires_utf16_fallback(&file.content, SEPARATORS, chunk_size) {
            return Err(
                "DXGEN_RAG_UNSUPPORTED_UTF16_SPLIT: use the TypeScript fallback".to_string(),
            );
        }
        let raw_chunks = split_text(&file.content, SEPARATORS, chunk_size, chunk_overlap);
        let chunk_count = raw_chunks.len();
        let mut search_cursor = 0;
        for (chunk_index, text) in raw_chunks.into_iter().enumerate() {
            let content_hash = sha256(&text);
            let relative_start = file.content[search_cursor..].find(&text);
            let start = relative_start.map_or(0, |value| search_cursor + value);
            if relative_start.is_some() {
                search_cursor = start + text.chars().next().map(char::len_utf8).unwrap_or_default();
            }
            chunks.push(FileChunk {
                id: format!("{}:{chunk_index}", file.relative_path),
                metadata: metadata(
                    &file,
                    chunk_index,
                    chunk_count,
                    &text,
                    &file_hash,
                    &content_hash,
                    start,
                    relative_start.is_some(),
                ),
                text,
            });
        }
    }
    Ok(RagOutput {
        schema_version: 1,
        chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recursive_split_preserves_overlap_and_whitespace_behavior() {
        assert_eq!(
            split_text("alpha beta gamma delta", SEPARATORS, 12, 5),
            ["alpha beta", "beta gamma", "delta"]
        );
    }

    #[test]
    fn rejects_invalid_chunk_configuration() {
        let error = chunk_project(Path::new("."), 10, 10).err().unwrap();
        assert!(error.contains("overlap"));
    }

    #[test]
    fn detects_a_hard_split_that_would_separate_utf16_surrogates() {
        assert!(requires_utf16_fallback("ab🌎cd", SEPARATORS, 3));
        assert!(!requires_utf16_fallback("ab 🌎 cd", SEPARATORS, 10));
    }
}
