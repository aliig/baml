use serde::{Deserialize, Serialize};

pub type ChatCompletionResponse = ChatCompletionGeneric<ChatCompletionChoice>;

pub type ChatCompletionResponseDelta = ChatCompletionGeneric<ChatCompletionChoiceDelta>;

/// Represents a chat completion response returned by model, based on the provided input.
#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct ChatCompletionGeneric<C> {
    /// A unique identifier for the chat completion.
    pub id: String,
    /// A list of chat completion choices. Can be more than one if `n` is greater than 1.s
    pub choices: Vec<C>,
    /// The Unix timestamp (in seconds) of when the chat completion was created.
    pub created: u32,
    /// The model used for the chat completion.
    pub model: String,
    /// This fingerprint represents the backend configuration that the model runs with.
    ///
    /// Can be used in conjunction with the `seed` request parameter to understand when backend changes have been made that might impact determinism.
    pub system_fingerprint: Option<String>,

    /// The object type, which is `chat.completion` for non-streaming chat completion, `chat.completion.chunk` for streaming chat completion.
    pub object: String,
    pub usage: Option<CompletionUsage>,
}

#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct ChatCompletionChoice {
    /// The index of the choice in the list of choices.
    pub index: u32,
    pub message: ChatCompletionResponseMessage,
    /// The reason the model stopped generating tokens. This will be `stop` if the model hit a natural stop point or a provided stop sequence,
    /// `length` if the maximum number of tokens specified in the request was reached,
    /// `content_filter` if content was omitted due to a flag from our content filters,
    /// `tool_calls` if the model called a tool, or `function_call` (deprecated) if the model called a function.
    pub finish_reason: Option<FinishReason>,
    /// Log probability information for the choice.
    pub logprobs: Option<ChatChoiceLogprobs>,
}

/// Usage statistics for the completion request.
#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct CompletionUsage {
    /// Number of tokens in the prompt.
    pub prompt_tokens: u32,
    /// Number of tokens in the generated completion.
    pub completion_tokens: u32,
    /// Total number of tokens used in the request (prompt + completion).
    pub total_tokens: u32,
}

/// A chat completion message generated by the model.
#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct ChatCompletionResponseMessage {
    /// The contents of the message.
    pub content: Option<String>,

    /// The tool calls generated by the model, such as function calls.
    // pub tool_calls: Option<Vec<ChatCompletionMessageToolCall>>,

    /// The role of the author of this message.
    pub role: ChatCompletionMessageRole,
    // Deprecated and replaced by `tool_calls`.
    // The name and arguments of a function that should be called, as generated by the model.
    // #[deprecated]
    // pub function_call: Option<FunctionCall>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ChatCompletionChoiceDelta {
    pub index: u64,
    pub finish_reason: Option<String>,
    pub delta: ChatCompletionMessageDelta,
}

/// Same as ChatCompletionMessage, but received during a response stream.
#[derive(Deserialize, Clone, Debug)]
pub struct ChatCompletionMessageDelta {
    /// The role of the author of this message.
    pub role: Option<ChatCompletionMessageRole>,
    /// The contents of the message
    pub content: Option<String>,
    // The name of the user in a multi-user chat
    // #[serde(skip_serializing_if = "Option::is_none")]
    // pub name: Option<String>,
    // The function that ChatGPT called
    //
    // [API Reference](https://platform.openai.com/docs/api-reference/chat/create#chat/create-function_call)
    // #[serde(skip_serializing_if = "Option::is_none")]
    // pub function_call: Option<ChatCompletionFunctionCallDelta>,
}

#[derive(Debug, Deserialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChatCompletionMessageRole {
    System,
    #[default]
    User,
    Assistant,
    Tool,
    Function,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
    FunctionCall,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct ChatChoiceLogprobs {
    /// A list of message content tokens with log probability information.
    pub content: Option<Vec<ChatCompletionTokenLogprob>>,
}

#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct ChatCompletionTokenLogprob {
    /// The token.
    pub token: String,
    /// The log probability of this token.
    pub logprob: f32,
    /// A list of integers representing the UTF-8 bytes representation of the token. Useful in instances where characters are represented by multiple tokens and their byte representations must be combined to generate the correct text representation. Can be `null` if there is no bytes representation for the token.
    pub bytes: Option<Vec<u8>>,
    ///  List of the most likely tokens and their log probability, at this token position. In rare cases, there may be fewer than the number of requested `top_logprobs` returned.
    pub top_logprobs: Vec<TopLogprobs>,
}

#[derive(Debug, Deserialize, Clone, PartialEq)]
pub struct TopLogprobs {
    /// The token.
    pub token: String,
    /// The log probability of this token.
    pub logprob: f32,
    /// A list of integers representing the UTF-8 bytes representation of the token. Useful in instances where characters are represented by multiple tokens and their byte representations must be combined to generate the correct text representation. Can be `null` if there is no bytes representation for the token.
    pub bytes: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIErrorResponse {
    pub error: OpenAIError,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIError {
    pub message: String,
    pub r#type: String,
    pub code: Option<String>,
}
