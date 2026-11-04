// Run inside the pinned upstream checkout; all filesystem writes use its test HOME.
use std::sync::Arc;
use cc_switch_lib::{parse_deeplink_url, import_provider_from_deeplink, AppState, Database};
#[path = "support.rs"]
mod support;

#[test]
fn dimagent_generated_links_import_with_actual_host_code() {
    let _guard = support::test_mutex().lock().unwrap();
    support::reset_test_fs();
    let _home = support::ensure_test_home();
    let db = Arc::new(Database::memory().unwrap());
    let state = AppState::new(db.clone());
    let fixtures: serde_json::Value = serde_json::from_slice(&std::fs::read(std::env::var("DIM_IMPORT_FIXTURES").unwrap()).unwrap()).unwrap();
    for entry in fixtures.as_array().unwrap() {
        let app = entry["app"].as_str().unwrap();
        let protocol = entry["protocol"].as_str().unwrap();
        let request = parse_deeplink_url(entry["url"].as_str().unwrap()).unwrap();
        assert_eq!(request.enabled, Some(false));
        assert_eq!(request.model.as_deref(), Some("vendor/full-model-id"));
        assert_eq!(request.api_key.as_deref(), Some("public-mock-relay-key"));
        let id = import_provider_from_deeplink(&state, request).unwrap();
        let rows = db.get_all_providers(app).unwrap();
        let row = &rows[&id];
        let settings = &row.settings_config;
        let text = settings.to_string();
        assert!(text.contains("vendor/full-model-id"));
        assert!(text.contains("127.0.0.1:3489"));
        assert!(!text.contains("access_token"));
        if app == "codex" && protocol == "openai" {
            let config = settings["config"].as_str().unwrap();
            assert!(config.contains("model_reasoning_effort = \"low\""));
        }
        if app == "codex" && protocol != "openai" {
            let config = settings["config"].as_str().unwrap();
            assert!(!config.contains("model_reasoning_effort"));
        }
        if app == "claude" || app == "codex" || app == "grokbuild" {
            let expected = match protocol {
                "openai" => "openai_chat",
                "openai-response" => "openai_responses",
                "anthropic" => "anthropic",
                "gemini" => "gemini_native",
                _ => unreachable!(),
            };
            assert_eq!(row.meta.as_ref().unwrap().api_format.as_deref(), Some(expected));
        }
        if app == "gemini" || app == "agy" {
            let model = if app == "agy" { &settings["config"]["model"]["name"] } else { &settings["env"]["GEMINI_MODEL"] };
            assert_eq!(model, "vendor/full-model-id");
            assert!(settings["env"]["GOOGLE_GEMINI_BASE_URL"].as_str().unwrap().ends_with("/gemini"));
        }
        if app == "hermes" {
            let expected = match protocol {
                "openai" => "chat_completions",
                "openai-response" => "codex_responses",
                "anthropic" => "anthropic_messages",
                _ => unreachable!(),
            };
            assert_eq!(settings["api_mode"], expected);
        }
        if app == "openclaw" || app == "pi" {
            let expected = match protocol {
                "openai" => "openai-completions",
                "openai-response" => "openai-responses",
                "anthropic" => "anthropic-messages",
                "gemini" => "google-generative-ai",
                _ => unreachable!(),
            };
            assert_eq!(settings["api"], expected);
        }
        if app == "opencode" {
            let expected = match protocol {
                "openai" => "@ai-sdk/openai-compatible",
                "openai-response" => "@ai-sdk/openai",
                "anthropic" => "@ai-sdk/anthropic",
                "gemini" => "@ai-sdk/google",
                _ => unreachable!(),
            };
            assert_eq!(settings["npm"], expected);
        }
    }
}
