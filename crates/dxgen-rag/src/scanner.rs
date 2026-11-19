use std::collections::HashSet;
use std::fs;
use std::path::Path;

use ignore::{DirEntry, WalkBuilder};

use crate::types::ScannedFile;

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

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn read_scanned_file(
    root: &Path,
    entry: DirEntry,
    included: &HashSet<&str>,
) -> Result<Option<ScannedFile>, String> {
    if !entry.file_type().is_some_and(|kind| kind.is_file()) {
        return Ok(None);
    }
    let extension = entry.path().extension().and_then(|value| value.to_str());
    if !extension.is_some_and(|value| included.contains(value)) {
        return Ok(None);
    }
    if entry.metadata().map_err(|error| error.to_string())?.len() > MAX_FILE_SIZE {
        return Ok(None);
    }

    let relative = entry
        .path()
        .strip_prefix(root)
        .map_err(|error| error.to_string())?;
    Ok(Some(ScannedFile {
        full_path: normalize_path(&root.join(relative))
            .trim_start_matches("./")
            .to_string(),
        relative_path: normalize_path(relative),
        content: String::from_utf8_lossy(
            &fs::read(entry.path()).map_err(|error| error.to_string())?,
        )
        .into_owned(),
    }))
}

pub(crate) fn scan_project(root: &Path) -> Result<Vec<ScannedFile>, String> {
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
        if let Some(file) = read_scanned_file(root, entry, &included)? {
            files.push(file);
        }
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}
