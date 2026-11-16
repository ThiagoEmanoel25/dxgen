use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;

const DEFAULT_CHUNK_SIZE: usize = 1500;
const DEFAULT_CHUNK_OVERLAP: usize = 200;
const MAX_FILE_SIZE: u64 = 1024 * 1024;
const INCLUDED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "java", "rb", "rs", "php", "cs", "swift",
    "kt", "kts", "scala", "md", "mdx", "yml", "yaml", "json",
];
const EXCLUDED_DIRECTORIES: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "out",
    ".turbo",
    ".cache",
];
const SEPARATORS: &[&str] = &["\n\n", "\n", " ", ""];

#[derive(Clone)]
struct ScannedFile {
    full_path: String,
    relative_path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RagOutput {
    schema_version: u8,
    chunks: Vec<FileChunk>,
}

#[derive(Serialize)]
struct FileChunk {
    id: String,
    text: String,
    metadata: FileChunkMetadata,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileChunkMetadata {
    source: String,
    relative_path: String,
    chunk_index: usize,
    chunk_count: usize,
    start_line: usize,
    end_line: usize,
    file_type: &'static str,
    is_config: bool,
    is_package_json: bool,
    is_readme: bool,
    is_env_example: bool,
    is_ci_config: bool,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn scan_project(root: &Path) -> Result<Vec<ScannedFile>, String> {
    if !root.is_dir() {
        return Err(format!(
            "Repository path is not a readable directory: {}",
            root.display()
        ));
    }

    let included: HashSet<&str> = INCLUDED_EXTENSIONS.iter().copied().collect();
    let excluded: HashSet<&str> = EXCLUDED_DIRECTORIES.iter().copied().collect();
    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(true)
        .ignore(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(false)
        .require_git(false)
        .follow_links(true)
        .filter_entry(move |entry| {
            entry.depth() == 0
                || !entry.file_type().is_some_and(|kind| kind.is_dir())
                || !excluded.contains(entry.file_name().to_string_lossy().as_ref())
        });

    let mut files = Vec::new();
    for result in builder.build() {
        let entry = result.map_err(|error| error.to_string())?;
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let extension = entry.path().extension().and_then(|value| value.to_str());
        if !extension.is_some_and(|value| included.contains(value)) {
            continue;
        }
        if entry.metadata().map_err(|error| error.to_string())?.len() > MAX_FILE_SIZE {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|error| error.to_string())?;
        let relative_path = normalize_path(relative);
        let full_path = normalize_path(&root.join(relative))
            .trim_start_matches("./")
            .to_string();
        files.push(ScannedFile {
            full_path,
            relative_path,
            content: String::from_utf8_lossy(
                &fs::read(entry.path()).map_err(|error| error.to_string())?,
            )
            .into_owned(),
        });
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
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
    let next = (separator_index + 1 < separators.len())
        .then_some(&separators[separator_index + 1..]);

    split_on_separator(text, separator).into_iter().any(|split| {
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

fn chunk_project(
    root: &Path,
    chunk_size: usize,
    chunk_overlap: usize,
) -> Result<RagOutput, String> {
    if chunk_size == 0 || chunk_overlap >= chunk_size {
        return Err("chunk size must be positive and chunk overlap must be smaller".to_string());
    }
    let mut chunks = Vec::new();
    for file in scan_project(root)? {
        if requires_utf16_fallback(&file.content, SEPARATORS, chunk_size) {
            return Err("DXGEN_RAG_UNSUPPORTED_UTF16_SPLIT: use the TypeScript fallback".to_string());
        }
        let raw_chunks = split_text(&file.content, SEPARATORS, chunk_size, chunk_overlap);
        let chunk_count = raw_chunks.len();
        let mut search_cursor = 0;
        for (chunk_index, text) in raw_chunks.into_iter().enumerate() {
            let relative_start = file.content[search_cursor..].find(&text);
            let start = relative_start.map_or(0, |value| search_cursor + value);
            if relative_start.is_some() {
                search_cursor = start + text.len();
            }
            chunks.push(FileChunk {
                id: format!("{}:{chunk_index}", file.relative_path),
                metadata: metadata(
                    &file,
                    chunk_index,
                    chunk_count,
                    &text,
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

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<(PathBuf, usize, usize), String> {
    let mut args = args.into_iter();
    let mut root = None;
    let mut chunk_size = DEFAULT_CHUNK_SIZE;
    let mut chunk_overlap = DEFAULT_CHUNK_OVERLAP;
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--chunk-size" => {
                chunk_size = args
                    .next()
                    .and_then(|value| value.parse().ok())
                    .ok_or("--chunk-size must be a positive integer")?
            }
            "--chunk-overlap" => {
                chunk_overlap = args
                    .next()
                    .and_then(|value| value.parse().ok())
                    .ok_or("--chunk-overlap must be a non-negative integer")?
            }
            value if value.starts_with('-') => return Err(format!("Unknown option: {value}")),
            value if root.is_none() => root = Some(PathBuf::from(value)),
            _ => {
                return Err(
                    "Usage: dxgen-rag <repository-path> [--chunk-size 1500] [--chunk-overlap 200]"
                        .to_string(),
                );
            }
        }
    }
    root.map(|root| (root, chunk_size, chunk_overlap))
        .ok_or_else(|| {
            "Usage: dxgen-rag <repository-path> [--chunk-size 1500] [--chunk-overlap 200]"
                .to_string()
        })
}

fn run() -> Result<(), String> {
    let (root, chunk_size, chunk_overlap) = parse_args(env::args().skip(1))?;
    let output = chunk_project(&root, chunk_size, chunk_overlap)?;
    println!(
        "{}",
        serde_json::to_string(&output).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
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
        assert!(!requires_utf16_fallback("ab 🌎 cd", SEPARATORS, 3));
    }
}
