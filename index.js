const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// Bot configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7594601856:AAGVN4fm7YoCiMofOY-VUX-iKqcNrt-oFz4';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Initialize OpenAI client with OpenRouter
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});

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

// Function to fetch Singapore weather data
async function getSingaporeWeather() {
    return new Promise((resolve, reject) => {
        https.get('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast', (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const weatherData = JSON.parse(data);
                    if (weatherData.code === 0 && weatherData.data) {
                        const forecasts = weatherData.data.items[0].forecasts;
                        const timestamp = weatherData.data.items[0].timestamp;
                        
                        // Get forecasts for key areas including AMK
                        const keyAreas = ['Ang Mo Kio', 'City', 'Bedok', 'Jurong West', 'Woodlands'];
                        const keyForecasts = forecasts.filter(f => keyAreas.includes(f.area));
                        const otherForecasts = forecasts.filter(f => !keyAreas.includes(f.area)).slice(0, 3);
                        
                        const allForecasts = [...keyForecasts, ...otherForecasts];
                        const sampleForecasts = allForecasts.map(f => 
                            `${f.area}: ${f.forecast}`
                        ).join(', ');
                        
                        resolve({
                            success: true,
                            timestamp: new Date(timestamp).toLocaleString('en-SG'),
                            summary: sampleForecasts,
                            totalAreas: forecasts.length
                        });
                    } else {
                        resolve({ success: false, error: 'Invalid data format' });
                    }
                } catch (error) {
                    resolve({ success: false, error: 'Failed to parse weather data' });
                }
            });
        }).on('error', (error) => {
            resolve({ success: false, error: error.message });
        });
    });
}

// Function to get Weather Uncle's response
async function getWeatherUncleResponse(userMessage, username) {
    try {
        // Check if user is asking about Singapore weather
        const isWeatherQuery = /singapore|weather|forecast|rain|sunny|cloudy|temperature|humid/i.test(userMessage);
        let contextualPrompt = weatherUnclePrompt;
        let weatherData = null;
        
        if (isWeatherQuery) {
            console.log('🌤️ Fetching Singapore weather data...');
            weatherData = await getSingaporeWeather();
            
            if (weatherData.success) {
                contextualPrompt += `\n\n🔴 IMPORTANT: REAL-TIME SINGAPORE WEATHER DATA (${weatherData.timestamp}):\n${weatherData.summary}\n(This covers ${weatherData.totalAreas} areas across Singapore)\n\nYOU MUST reference this actual current weather data in your response. Don't make up weather information - use the real data provided above. Mention specific areas and their current conditions from this data.`;
                console.log('✅ Weather data fetched successfully');
                console.log('📊 Weather Data Summary:', weatherData.summary);
                console.log('🕐 Data Timestamp:', weatherData.timestamp);
            } else {
                console.log('⚠️ Weather data fetch failed:', weatherData.error);
            }
        }

        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o",
            messages: [
                {
                    role: "system",
                    content: contextualPrompt
                },
                {
                    role: "user",
                    content: userMessage
                }
            ],
            max_tokens: 500,
            temperature: 0.8
        });

        let finalResponse = response.choices[0].message.content;
        
        // Add API proof footer for weather queries
        if (isWeatherQuery && weatherData && weatherData.success) {
            finalResponse += `\n\n📡 *Weather insights powered by Singapore Government API (${weatherData.timestamp})*`;
        }

        return finalResponse;
    } catch (error) {
        console.error('❌ OpenRouter API Error:', error.message);
        
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
console.log('🔑 OpenRouter API Key:', OPENROUTER_API_KEY ? 'Configured' : 'Missing');

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
