# Weather Uncle Telegram Bot

## Overview

Weather Uncle Bot is a personality-driven Telegram chatbot that embodies an enthusiastic weather expert character. The bot leverages OpenAI's GPT-4o model to provide engaging conversations about meteorology, weather patterns, and climate science. Unlike typical weather bots that simply provide forecasts, Weather Uncle creates an interactive experience by combining weather knowledge with a warm, storytelling personality that makes meteorology accessible and entertaining for users.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

**Application Architecture**: Single-file Node.js application using a straightforward polling-based approach for message handling. The architecture prioritizes simplicity and reliability over complex microservices patterns.

**Character-Driven AI Integration**: The system uses a modular prompt system where the bot's personality is defined in an external markdown file (`prompt.md`). This allows for easy character customization without code changes. The OpenAI GPT-4o model processes user messages through a system prompt that establishes Weather Uncle's enthusiastic, knowledgeable, and slightly eccentric personality.

**Message Processing Flow**: Incoming Telegram messages are processed through a simple pipeline: message reception → character prompt injection → OpenAI API call → response formatting → Telegram response delivery. This linear approach ensures predictable behavior and easy debugging.

**Error Handling Strategy**: The application implements graceful degradation with try-catch blocks around critical operations. API failures are logged but don't crash the application, allowing the bot to continue serving other users.

**Logging System**: Basic structured logging captures message metadata (timestamp, chat ID, username, message preview, response length) in JSON format for debugging and monitoring purposes without storing sensitive conversation content.

**Configuration Management**: Environment variables handle sensitive credentials (Telegram bot token, OpenAI API key) with fallback defaults for development environments.

## External Dependencies

**Telegram Bot API**: Primary interface for receiving and sending messages through the `node-telegram-bot-api` library using polling mode (no webhook infrastructure required).

**OpenAI GPT-4o**: Core conversational AI engine that processes user messages and generates Weather Uncle's responses based on the character prompt system.

**File System**: Local file system dependency for loading the character prompt from `prompt.md`, enabling dynamic personality updates without application restarts.

**Environment Configuration**: `.env` file support through the `dotenv` library for secure credential management and deployment flexibility.