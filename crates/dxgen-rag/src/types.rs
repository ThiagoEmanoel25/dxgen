#[cfg(feature = "tokenize")]
use serde::Deserialize;
use serde::Serialize;

#[derive(Clone)]
pub(crate) struct ScannedFile {
    pub(crate) full_path: String,
    pub(crate) relative_path: String,
    pub(crate) content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RagOutput {
    pub(crate) schema_version: u8,
    pub(crate) chunks: Vec<FileChunk>,
}

#[derive(Serialize)]
pub(crate) struct FileChunk {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) metadata: FileChunkMetadata,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileChunkMetadata {
    pub(crate) source: String,
    pub(crate) relative_path: String,
    pub(crate) file_hash: String,
    pub(crate) content_hash: String,
    pub(crate) chunk_index: usize,
    pub(crate) chunk_count: usize,
    pub(crate) start_line: usize,
    pub(crate) end_line: usize,
    pub(crate) file_type: &'static str,
    pub(crate) is_config: bool,
    pub(crate) is_package_json: bool,
    pub(crate) is_readme: bool,
    pub(crate) is_env_example: bool,
    pub(crate) is_ci_config: bool,
}

#[cfg(feature = "tokenize")]
#[derive(Deserialize)]
pub(crate) struct TokenizeInput {
    pub(crate) texts: Vec<String>,
}

#[cfg(feature = "tokenize")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenizeOutput {
    pub(crate) schema_version: u8,
    pub(crate) encoding: &'static str,
    pub(crate) tokens: Vec<Vec<u32>>,
}
