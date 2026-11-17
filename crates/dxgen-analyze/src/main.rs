use std::env;
use std::path::PathBuf;

use dxgen_analyze::{analyze, discovered_paths};

#[derive(PartialEq)]
enum OutputFormat {
    Json,
    Files,
}

fn parse_args(
    args: impl IntoIterator<Item = String>,
) -> Result<(PathBuf, usize, OutputFormat), String> {
    let mut args = args.into_iter();
    let mut repository = None;
    let mut max_depth = 3;
    let mut format = OutputFormat::Json;

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
                format = match args.next().as_deref() {
                    Some("json") => OutputFormat::Json,
                    Some("files") => OutputFormat::Files,
                    _ => return Err("--format must be json or files".to_string()),
                };
            }
            value if value.starts_with('-') => return Err(format!("Unknown option: {value}")),
            value if repository.is_none() => repository = Some(PathBuf::from(value)),
            _ => return Err(usage()),
        }
    }

    repository
        .map(|path| (path, max_depth, format))
        .ok_or_else(usage)
}

fn usage() -> String {
    "Usage: dxgen-analyze <repository-path> [--max-depth 3] [--format json|files]".to_string()
}

fn run() -> Result<String, String> {
    let (repository, max_depth, format) = parse_args(env::args().skip(1))?;
    match format {
        OutputFormat::Json => serde_json::to_string_pretty(&analyze(&repository, max_depth)?)
            .map_err(|error| error.to_string()),
        OutputFormat::Files => serde_json::to_string(&discovered_paths(&repository)?)
            .map_err(|error| error.to_string()),
    }
}

fn main() {
    match run() {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
