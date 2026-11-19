mod chunker;
mod scanner;
mod types;

use std::env;
#[cfg(feature = "tokenize")]
use std::io::{self, Read};
use std::path::PathBuf;

use chunker::chunk_project;
#[cfg(feature = "tokenize")]
use types::{TokenizeInput, TokenizeOutput};

const DEFAULT_CHUNK_SIZE: usize = 1500;
const DEFAULT_CHUNK_OVERLAP: usize = 200;

enum Command {
    Chunk {
        root: PathBuf,
        chunk_size: usize,
        chunk_overlap: usize,
    },
    #[cfg(feature = "tokenize")]
    Tokenize,
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Command, String> {
    let mut args = args.into_iter().peekable();
    if args.peek().is_some_and(|argument| argument == "--tokenize") {
        args.next();
        #[cfg(feature = "tokenize")]
        return if args.next().is_none() {
            Ok(Command::Tokenize)
        } else {
            Err("Usage: dxgen-rag --tokenize < input.json".to_string())
        };
        #[cfg(not(feature = "tokenize"))]
        return Err("--tokenize requires a build with the `tokenize` feature enabled".to_string());
    }
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
    root.map(|root| Command::Chunk {
        root,
        chunk_size,
        chunk_overlap,
    })
        .ok_or_else(|| {
            "Usage: dxgen-rag <repository-path> [--chunk-size 1500] [--chunk-overlap 200]\n       dxgen-rag --tokenize < input.json".to_string()
        })
}

#[cfg(feature = "tokenize")]
fn tokenize(input: TokenizeInput) -> Result<TokenizeOutput, String> {
    let bpe = tiktoken_rs::cl100k_base().map_err(|error| error.to_string())?;
    Ok(TokenizeOutput {
        schema_version: 1,
        encoding: "cl100k_base",
        tokens: input
            .texts
            .iter()
            .map(|text| bpe.encode_ordinary(text))
            .collect(),
    })
}

fn run() -> Result<(), String> {
    let output = match parse_args(env::args().skip(1))? {
        Command::Chunk {
            root,
            chunk_size,
            chunk_overlap,
        } => serde_json::to_string(&chunk_project(&root, chunk_size, chunk_overlap)?),
        #[cfg(feature = "tokenize")]
        Command::Tokenize => {
            let mut input = String::new();
            io::stdin()
                .read_to_string(&mut input)
                .map_err(|error| error.to_string())?;
            let input = serde_json::from_str(&input).map_err(|error| error.to_string())?;
            serde_json::to_string(&tokenize(input)?)
        }
    }
    .map_err(|error| error.to_string())?;
    println!("{output}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(all(test, feature = "tokenize"))]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_cl100k_input_in_batches() {
        let output = tokenize(TokenizeInput {
            texts: vec!["hello world".to_string(), "olá 🌎".to_string()],
        })
        .unwrap();
        assert_eq!(output.schema_version, 1);
        assert_eq!(output.encoding, "cl100k_base");
        assert_eq!(output.tokens.len(), 2);
        assert!(!output.tokens[0].is_empty());
        assert!(!output.tokens[1].is_empty());
    }
}
