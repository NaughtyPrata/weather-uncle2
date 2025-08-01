# Weather Uncle Bot 🌤️

A friendly Telegram chatbot powered by OpenAI GPT-4o that responds as "Weather Uncle" - an enthusiastic weather expert who loves to chat about meteorology and climate.

## Features

- 🤖 **Personality-driven responses** using Weather Uncle character
- ⚡ **GPT-4o integration** for intelligent conversations  
- 📝 **Customizable character prompt** via external markdown file
- 🛡️ **Error handling** for API failures and network issues
- 📊 **Simple logging** for debugging and monitoring
- 🔄 **Polling-based** message handling (no webhooks needed)

## Setup Instructions

### 1. Environment Variables

Create a `.env` file in the project root:

```env
TELEGRAM_BOT_TOKEN=7594601856:AAGVN4fm7YoCiMofOY-VUX-iKqcNrt-oFz4
OPENAI_API_KEY=your_openai_api_key_here
