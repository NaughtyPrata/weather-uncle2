const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Bot configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7594601856:AAGVN4fm7YoCiMofOY-VUX-iKqcNrt-oFz4';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Load Weather Uncle character prompt
let weatherUnclePrompt = '';
try {
    weatherUnclePrompt = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
    console.log('✅ Weather Uncle character prompt loaded successfully');
} catch (error) {
    console.error('❌ Error loading prompt.md:', error.message);
    weatherUnclePrompt = 'You are Weather Uncle, a friendly and knowledgeable weather expert who loves to chat about weather and climate.';
}

// Simple logging function
function logMessage(chatId, username, message, response = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        chatId,
        username: username || 'Unknown',
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        responseLength: response ? response.length : 0
    };
    console.log('📝 Message Log:', JSON.stringify(logEntry, null, 2));
}

// Function to get Weather Uncle's response
async function getWeatherUncleResponse(userMessage, username) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: weatherUnclePrompt
                },
                {
                    role: "user",
                    content: userMessage
                }
            ],
            max_tokens: 500,
            temperature: 0.8
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('❌ OpenAI API Error:', error.message);
        
        if (error.code === 'insufficient_quota') {
            return "🤔 Weather Uncle is taking a short break due to API quota limits. Please try again later!";
        } else if (error.code === 'invalid_api_key') {
            return "⚠️ Weather Uncle can't access his weather data right now. Please check the API configuration.";
        } else {
            return "🌧️ Weather Uncle is experiencing some technical difficulties. Please try again in a moment!";
        }
    }
}

// Handle incoming messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    const userMessage = msg.text;

    // Skip non-text messages
    if (!userMessage) {
        return;
    }

    console.log(`📥 Received message from @${username} (${chatId}): ${userMessage}`);

    try {
        // Show typing indicator
        await bot.sendChatAction(chatId, 'typing');

        // Get Weather Uncle's response
        const response = await getWeatherUncleResponse(userMessage, username);

        // Send response
        await bot.sendMessage(chatId, response, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id
        });

        // Log the interaction
        logMessage(chatId, username, userMessage, response);

        console.log(`📤 Sent response to @${username}: ${response.substring(0, 50)}...`);

    } catch (error) {
        console.error('❌ Error handling message:', error.message);
        
        try {
            await bot.sendMessage(chatId, "⚠️ Weather Uncle encountered an unexpected error. Please try again!");
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError.message);
        }
    }
});

// Handle bot errors
bot.on('error', (error) => {
    console.error('❌ Telegram Bot Error:', error.message);
});

// Handle polling errors
bot.on('polling_error', (error) => {
    console.error('❌ Polling Error:', error.message);
});

// Startup message
console.log('🤖 Weather Uncle Bot is starting up...');
console.log('🔑 Telegram Token:', TELEGRAM_TOKEN ? 'Configured' : 'Missing');
console.log('🔑 OpenAI API Key:', OPENAI_API_KEY ? 'Configured' : 'Missing');

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down Weather Uncle Bot...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Terminating Weather Uncle Bot...');
    bot.stopPolling();
    process.exit(0);
});

console.log('✅ Weather Uncle Bot is now running and ready to chat about the weather! 🌤️');
