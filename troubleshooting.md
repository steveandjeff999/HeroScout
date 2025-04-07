# DLDScout AI Assistant Troubleshooting

This guide addresses common issues with the Bob AI Assistant.

## Common Issues

### "I'm still loading my brain. Please try again in a moment."

This message appears when the AI model is still initializing. The first time you run the application, it needs to download the model (about 500MB-1.5GB). This can take several minutes depending on your internet connection.

**Solution:** Wait for the model to finish loading. You can continue using other features of DLDScout while the model loads.

### "Server error: list index out of range"

This error typically occurs when there's a problem with the team numbers being processed.

**Solution:**
1. Make sure your query mentions valid team numbers
2. Try restarting the application
3. Check the server logs for more details

### "Error generating text with OpenAI"

This indicates a problem connecting to the OpenAI API.

**Solution:**
1. Check if you've provided a valid API key in config.ini
2. Ensure your internet connection is working
3. The system will automatically fall back to the local model

### Model takes too long to load or loads incorrectly

**Solution:**
1. Check your computer's available memory (the models require at least 4GB RAM)
2. Try a smaller model by editing config.ini and changing the local_model setting
3. Restart the application

## Installation Issues

### "Cannot import transformers"

**Solution:**
```
pip install -r requirements.txt
```

### "CUDA not available" warning

This means the application is using CPU instead of GPU for model inference.

**Solution:**
1. If you have a compatible NVIDIA GPU, install the CUDA toolkit
2. If not, the model will run on CPU, which is slower but will still work

## Advanced Configuration

You can modify the AI settings in `config.ini`:

```ini
[ai]
use_local_model = true
use_dynamic_generation = true
openai_api_key = 
openai_model = gpt-3.5-turbo
local_model = facebook/blenderbot-400M-distill
```

## Available Local Models

- `facebook/blenderbot-400M-distill`: Conversation model (~1.5GB)
- `distilgpt2`: Small language model (~500MB)
- `microsoft/DialoGPT-small`: Conversation model (~500MB)
- `EleutherAI/gpt-neo-125m`: Small GPT-Neo model (~500MB)
- `facebook/bart-base`: Text generation model (~500MB)
