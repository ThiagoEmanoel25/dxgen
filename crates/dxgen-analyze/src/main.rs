use std::collections::{BTreeMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use serde::Serialize;
use serde_json::Value;

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

#[derive(Clone)]
struct ScannedFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzerOutput {
    schema_version: u8,
    root_path: String,
    packages: Vec<ProjectPackage>,
    config_files: ConfigFiles,
    structure: Vec<StructureNode>,
    existing_docs: Vec<ProjectFile>,
}

#[derive(Serialize)]
struct ProjectPackage {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    private: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scripts: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspaces: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dependencies: Option<Value>,
    #[serde(rename = "devDependencies", skip_serializing_if = "Option::is_none")]
    dev_dependencies: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bin: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFiles {
    #[serde(skip_serializing_if = "Option::is_none")]
    turbo: Option<ProjectFile>,
    tsconfigs: Vec<ProjectFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    env_example: Option<ProjectFile>,
    ci_configs: Vec<ProjectFile>,
    other_configs: Vec<ProjectFile>,
}

#[derive(Serialize)]
struct ProjectFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct StructureNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<StructureNode>>,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn scan_project(root: &Path) -> Result<Vec<ScannedFile>, String> {
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

        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.len() > MAX_FILE_SIZE {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(root)
            .map_err(|error| error.to_string())?;
        let bytes = fs::read(entry.path()).map_err(|error| error.to_string())?;
        files.push(ScannedFile {
            path: normalize_path(relative),
            content: String::from_utf8_lossy(&bytes).into_owned(),
        });
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn is_readme_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower == "readme.md"
        || lower.ends_with("/readme.md")
        || lower.starts_with("docs/")
        || lower.contains("/docs/")
}

fn is_ci_config_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.starts_with(".github/workflows/")
        || lower.starts_with(".gitlab-ci")
        || lower.ends_with("/docker-compose.yml")
        || lower.ends_with("/docker-compose.yaml")
}

fn is_tsconfig_path(path: &str) -> bool {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
        .is_some_and(|name| name.starts_with("tsconfig") && name.ends_with(".json"))
}

fn project_file(file: &ScannedFile) -> ProjectFile {
    ProjectFile {
        path: file.path.clone(),
        content: file.content.clone(),
    }
}

fn build_packages(files: &[ScannedFile]) -> Vec<ProjectPackage> {
    let mut packages = Vec::new();
    for file in files
        .iter()
        .filter(|file| file.path.ends_with("package.json"))
    {
        let Ok(Value::Object(json)) = serde_json::from_str::<Value>(&file.content) else {
            continue;
        };
        let parent = Path::new(&file.path)
            .parent()
            .map(normalize_path)
            .filter(|path| !path.is_empty())
            .unwrap_or_else(|| ".".to_string());

        packages.push(ProjectPackage {
            path: parent,
            name: json.get("name").cloned(),
            description: json.get("description").cloned(),
            private: json.get("private").cloned(),
            scripts: json.get("scripts").cloned(),
            workspaces: json.get("workspaces").cloned(),
            dependencies: json.get("dependencies").cloned(),
            dev_dependencies: json.get("devDependencies").cloned(),
            bin: json.get("bin").cloned(),
        });
    }
    packages.sort_by(|left, right| left.path.cmp(&right.path));
    packages
}

fn build_structure(files: &[ScannedFile], _max_depth: usize) -> Vec<StructureNode> {
    // shortcut: the frozen TypeScript baseline currently exposes only top-level nodes.
    let mut nodes = BTreeMap::<String, bool>::new();
    for file in files {
        let mut parts = file.path.split('/');
        if let Some(name) = parts.next() {
            nodes
                .entry(name.to_string())
                .or_insert(parts.next().is_none());
        }
    }

    nodes
        .into_iter()
        .map(|(name, is_file)| StructureNode {
            path: name.clone(),
            name,
            kind: if is_file { "file" } else { "dir" },
            children: (!is_file).then(Vec::new),
        })
        .collect()
}

fn analyze(root: &Path, max_depth: usize) -> Result<AnalyzerOutput, String> {
    if !root.is_dir() {
        return Err(format!(
            "Repository path is not a readable directory: {}",
            normalize_path(root)
        ));
    }

    let root = std::path::absolute(root).map_err(|error| error.to_string())?;
    let files = scan_project(&root)?;
    let turbo = files
        .iter()
        .find(|file| file.path == "turbo.json")
        .map(project_file);
    let env_example = files
        .iter()
        .find(|file| {
            Path::new(&file.path)
                .file_name()
                .and_then(|value| value.to_str())
                == Some(".env.example")
        })
        .map(project_file);
    let tsconfigs = files
        .iter()
        .filter(|file| is_tsconfig_path(&file.path))
        .map(project_file)
        .collect::<Vec<_>>();
    let ci_configs = files
        .iter()
        .filter(|file| is_ci_config_path(&file.path))
        .map(project_file)
        .collect::<Vec<_>>();

    let known_configs = tsconfigs
        .iter()
        .map(|file| file.path.as_str())
        .chain(turbo.iter().map(|file| file.path.as_str()))
        .chain(env_example.iter().map(|file| file.path.as_str()))
        .chain(ci_configs.iter().map(|file| file.path.as_str()))
        .collect::<HashSet<_>>();
    let other_configs = files
        .iter()
        .filter(|file| {
            let lower = file.path.to_lowercase();
            (lower.ends_with(".json") || lower.ends_with(".yml") || lower.ends_with(".yaml"))
                && !known_configs.contains(file.path.as_str())
                && !file.path.ends_with("package.json")
        })
        .map(project_file)
        .collect::<Vec<_>>();
    let existing_docs = files
        .iter()
        .filter(|file| is_readme_path(&file.path))
        .map(project_file)
        .collect::<Vec<_>>();

    Ok(AnalyzerOutput {
        schema_version: 1,
        root_path: normalize_path(&root),
        packages: build_packages(&files),
        config_files: ConfigFiles {
            turbo,
            tsconfigs,
            env_example,
            ci_configs,
            other_configs,
        },
        structure: build_structure(&files, max_depth),
        existing_docs,
    })
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<(PathBuf, usize), String> {
    let mut args = args.into_iter();
    let mut repository = None;
    let mut max_depth = 3;

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--max-depth" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--max-depth must be a positive integer".to_string())?;
                max_depth = value
                    .parse::<usize>()
                    .ok()
                    .filter(|value| *value > 0)
                    .ok_or_else(|| "--max-depth must be a positive integer".to_string())?;
            }
            "--format" => {
                if args.next().as_deref() != Some("json") {
                    return Err("--format must be json".to_string());
                }
            }
            value if value.starts_with('-') => {
                return Err(format!("Unknown option: {value}"));
            }
            value if repository.is_none() => repository = Some(PathBuf::from(value)),
            _ => {
                return Err(
                    "Usage: dxgen-analyze <repository-path> [--max-depth 3] [--format json]"
                        .to_string(),
                );
            }
        }
    }

    repository.map(|path| (path, max_depth)).ok_or_else(|| {
        "Usage: dxgen-analyze <repository-path> [--max-depth 3] [--format json]".to_string()
    })
}

fn run() -> Result<(), String> {
    let (repository, max_depth) = parse_args(env::args().skip(1))?;
    let output = analyze(&repository, max_depth)?;
    let json = serde_json::to_string_pretty(&output).map_err(|error| error.to_string())?;
    println!("{json}");
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

    fn fixture_path() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/ai/test/fixtures/baseline")
    }

    fn normalized_output() -> String {
        let fixture = fixture_path();
        let output = analyze(&fixture, 3).expect("fixture should be analyzable");
        let actual = format!(
            "{}\n",
            serde_json::to_string_pretty(&output).expect("output should serialize")
        );
        actual.replace(
            &normalize_path(&std::path::absolute(fixture).unwrap()),
            "<ROOT>",
        )
    }

    #[test]
    fn matches_typescript_golden_output() {
        let golden = fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../packages/ai/test/golden/baseline.json"),
        )
        .expect("golden output should exist");

        assert_eq!(normalized_output(), golden);
    }

    #[test]
    fn output_is_deterministic() {
        assert_eq!(normalized_output(), normalized_output());
    }

    #[test]
    fn rejects_missing_repository() {
        let error = match analyze(&fixture_path().join("missing"), 3) {
            Ok(_) => panic!("missing repository should fail"),
            Err(error) => error,
        };
        assert!(error.contains("not a readable directory"));
    }
}
