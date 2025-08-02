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

// Templated footer generator
function createAPIFooter(apiName, timestamp, dataSource) {
    return `\n\n📡 *${apiName} insights powered by ${dataSource} (${timestamp})*`;
}

// Generic data fetcher
const fetchData = (url) => {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    resolve({ code: -1, error: 'Parse error' });
                }
            });
        }).on('error', () => {
            resolve({ code: -1, error: 'Network error' });
        });
    });
};

// MODULAR API TOOLS

// Weather API Tool
async function getWeatherData() {
    console.log('🌤️ Fetching Singapore weather data...');
    
    const [forecastData, tempData, humidityData, windData] = await Promise.all([
        fetchData('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'),
        fetchData('https://api-open.data.gov.sg/v2/real-time/api/air-temperature'),
        fetchData('https://api-open.data.gov.sg/v2/real-time/api/relative-humidity'),
        fetchData('https://api-open.data.gov.sg/v2/real-time/api/wind-speed')
    ]);

    try {
        let summary = '';
        let timestamp = '';

        // Process forecast data
        if (forecastData.code === 0 && forecastData.data) {
            const forecasts = forecastData.data.items[0].forecasts;
            timestamp = new Date(forecastData.data.items[0].timestamp).toLocaleString('en-SG');
            
            const keyAreas = ['Ang Mo Kio', 'City', 'Bedok', 'Jurong West', 'Woodlands'];
            const keyForecasts = forecasts.filter(f => keyAreas.includes(f.area));
            const otherForecasts = forecasts.filter(f => !keyAreas.includes(f.area)).slice(0, 3);
            const allForecasts = [...keyForecasts, ...otherForecasts];
            
            summary += 'FORECAST: ' + allForecasts.map(f => `${f.area}: ${f.forecast}`).join(', ');
        }

        // Process temperature data
        if (tempData.code === 0 && tempData.data?.stations) {
            const tempReadings = tempData.data.stations
                .filter(s => s.reading !== undefined)
                .slice(0, 5)
                .map(s => `${s.name}: ${s.reading}°C`);
            if (tempReadings.length > 0) {
                summary += ' | TEMPERATURE: ' + tempReadings.join(', ');
            }
        }

        // Process humidity data
        if (humidityData.code === 0 && humidityData.data?.stations) {
            const humidityReadings = humidityData.data.stations
                .filter(s => s.reading !== undefined)
                .slice(0, 3)
                .map(s => `${s.name}: ${s.reading}%`);
            if (humidityReadings.length > 0) {
                summary += ' | HUMIDITY: ' + humidityReadings.join(', ');
            }
        }

        // Process wind data
        if (windData.code === 0 && windData.data?.stations) {
            const windReadings = windData.data.stations
                .filter(s => s.reading !== undefined)
                .slice(0, 3)
                .map(s => `${s.name}: ${s.reading} km/h`);
            if (windReadings.length > 0) {
                summary += ' | WIND: ' + windReadings.join(', ');
            }
        }

        console.log('✅ Weather data fetched successfully');
        console.log(`📊 Weather Data Summary: ${summary.substring(0, 200)}...`);
        console.log(`🕐 Data Timestamp: ${timestamp}`);

        return {
            success: true,
            timestamp: timestamp,
            summary: summary,
            totalAreas: forecastData.data?.items?.[0]?.forecasts?.length || 0,
            footer: createAPIFooter('Weather', timestamp, 'Singapore Government APIs')
        };

    } catch (error) {
        console.error('❌ Failed to fetch weather data:', error.message);
        return { success: false, error: 'Failed to process weather data' };
    }
}

// Traffic Camera API Tool
async function getTrafficData() {
    console.log('🚗 Fetching Singapore traffic camera data...');
    
    const trafficData = await fetchData('https://api.data.gov.sg/v1/transport/traffic-images');
    
    try {
        if (trafficData.items && trafficData.items.length > 0) {
            const cameras = trafficData.items[0].cameras;
            const timestamp = new Date(trafficData.items[0].timestamp).toLocaleString('en-SG');
            
            // Get sample of traffic cameras from different areas
            const sampleCameras = cameras.slice(0, 8).map(cam => ({
                id: cam.camera_id,
                image: cam.image,
                location: `${cam.location.latitude.toFixed(4)}, ${cam.location.longitude.toFixed(4)}`,
                imageTime: new Date(cam.timestamp).toLocaleString('en-SG')
            }));
            
            let summary = `TRAFFIC CAMERAS (${cameras.length} total): `;
            summary += sampleCameras.map(cam => 
                `Camera ${cam.id} (${cam.location}) - Image: ${cam.image}`
            ).join(' | ');
            
            console.log('✅ Traffic data fetched successfully');
            console.log(`📊 Traffic Data Summary: ${cameras.length} cameras available`);
            console.log(`🕐 Data Timestamp: ${timestamp}`);
            
            return {
                success: true,
                timestamp: timestamp,
                summary: summary,
                cameras: sampleCameras,
                totalCameras: cameras.length,
                footer: createAPIFooter('Traffic', timestamp, 'Singapore Government Traffic APIs')
            };
        } else {
            throw new Error('No traffic data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch traffic data:', error.message);
        return { success: false, error: 'Failed to process traffic data' };
    }
}

// Legacy wrapper for backward compatibility
async function getSingaporeWeather() {
    return await getWeatherData();
}

// ADDITIONAL SINGAPORE GOVERNMENT API TOOLS (NOT INTEGRATED INTO CHATBOT YET)

// PSI (Pollutant Standards Index) API Tool
async function getPSIData() {
    console.log('🏭 Fetching Singapore PSI data...');
    
    const psiData = await fetchData('https://api.data.gov.sg/v1/environment/psi');
    
    try {
        if (psiData.items && psiData.items.length > 0) {
            const readings = psiData.items[0].readings;
            const timestamp = new Date(psiData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                footer: createAPIFooter('PSI', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No PSI data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch PSI data:', error.message);
        return { success: false, error: 'Failed to process PSI data' };
    }
}

// PM2.5 API Tool
async function getPM25Data() {
    console.log('💨 Fetching Singapore PM2.5 data...');
    
    const pm25Data = await fetchData('https://api.data.gov.sg/v1/environment/pm25');
    
    try {
        if (pm25Data.items && pm25Data.items.length > 0) {
            const readings = pm25Data.items[0].readings;
            const timestamp = new Date(pm25Data.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                footer: createAPIFooter('PM2.5', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No PM2.5 data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch PM2.5 data:', error.message);
        return { success: false, error: 'Failed to process PM2.5 data' };
    }
}

// Air Temperature (v1) API Tool
async function getAirTemperatureV1Data() {
    console.log('🌡️ Fetching Singapore Air Temperature (v1) data...');
    
    const tempData = await fetchData('https://api.data.gov.sg/v1/environment/air-temperature');
    
    try {
        if (tempData.items && tempData.items.length > 0) {
            const readings = tempData.items[0].readings;
            const timestamp = new Date(tempData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                stations: tempData.metadata?.stations || [],
                footer: createAPIFooter('Air Temperature', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No air temperature data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch air temperature data:', error.message);
        return { success: false, error: 'Failed to process air temperature data' };
    }
}

// Rainfall API Tool
async function getRainfallData() {
    console.log('🌧️ Fetching Singapore Rainfall data...');
    
    const rainfallData = await fetchData('https://api.data.gov.sg/v1/environment/rainfall');
    
    try {
        if (rainfallData.items && rainfallData.items.length > 0) {
            const readings = rainfallData.items[0].readings;
            const timestamp = new Date(rainfallData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                stations: rainfallData.metadata?.stations || [],
                footer: createAPIFooter('Rainfall', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No rainfall data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch rainfall data:', error.message);
        return { success: false, error: 'Failed to process rainfall data' };
    }
}

// Relative Humidity (v1) API Tool
async function getRelativeHumidityV1Data() {
    console.log('💧 Fetching Singapore Relative Humidity (v1) data...');
    
    const humidityData = await fetchData('https://api.data.gov.sg/v1/environment/relative-humidity');
    
    try {
        if (humidityData.items && humidityData.items.length > 0) {
            const readings = humidityData.items[0].readings;
            const timestamp = new Date(humidityData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                stations: humidityData.metadata?.stations || [],
                footer: createAPIFooter('Relative Humidity', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No relative humidity data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch relative humidity data:', error.message);
        return { success: false, error: 'Failed to process relative humidity data' };
    }
}

// Wind Direction API Tool
async function getWindDirectionData() {
    console.log('🧭 Fetching Singapore Wind Direction data...');
    
    const windData = await fetchData('https://api.data.gov.sg/v1/environment/wind-direction');
    
    try {
        if (windData.items && windData.items.length > 0) {
            const readings = windData.items[0].readings;
            const timestamp = new Date(windData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                stations: windData.metadata?.stations || [],
                footer: createAPIFooter('Wind Direction', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No wind direction data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch wind direction data:', error.message);
        return { success: false, error: 'Failed to process wind direction data' };
    }
}

// Wind Speed (v1) API Tool
async function getWindSpeedV1Data() {
    console.log('💨 Fetching Singapore Wind Speed (v1) data...');
    
    const windData = await fetchData('https://api.data.gov.sg/v1/environment/wind-speed');
    
    try {
        if (windData.items && windData.items.length > 0) {
            const readings = windData.items[0].readings;
            const timestamp = new Date(windData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                stations: windData.metadata?.stations || [],
                footer: createAPIFooter('Wind Speed', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No wind speed data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch wind speed data:', error.message);
        return { success: false, error: 'Failed to process wind speed data' };
    }
}

// UV Index API Tool
async function getUVIndexData() {
    console.log('☀️ Fetching Singapore UV Index data...');
    
    const uvData = await fetchData('https://api.data.gov.sg/v1/environment/uv-index');
    
    try {
        if (uvData.items && uvData.items.length > 0) {
            const readings = uvData.items[0].readings;
            const timestamp = new Date(uvData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                readings: readings,
                footer: createAPIFooter('UV Index', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No UV index data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch UV index data:', error.message);
        return { success: false, error: 'Failed to process UV index data' };
    }
}

// 2-Hour Weather Forecast (v1) API Tool
async function get2HourForecastV1Data() {
    console.log('🌤️ Fetching Singapore 2-Hour Forecast (v1) data...');
    
    const forecastData = await fetchData('https://api.data.gov.sg/v1/environment/2-hour-weather-forecast');
    
    try {
        if (forecastData.items && forecastData.items.length > 0) {
            const forecasts = forecastData.items[0].forecasts;
            const timestamp = new Date(forecastData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                forecasts: forecasts,
                footer: createAPIFooter('2-Hour Forecast', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No 2-hour forecast data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch 2-hour forecast data:', error.message);
        return { success: false, error: 'Failed to process 2-hour forecast data' };
    }
}

// 24-Hour Weather Forecast API Tool
async function get24HourForecastData() {
    console.log('📅 Fetching Singapore 24-Hour Forecast data...');
    
    const forecastData = await fetchData('https://api.data.gov.sg/v1/environment/24-hour-weather-forecast');
    
    try {
        if (forecastData.items && forecastData.items.length > 0) {
            const forecast = forecastData.items[0];
            const timestamp = new Date(forecast.timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                forecast: forecast,
                footer: createAPIFooter('24-Hour Forecast', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No 24-hour forecast data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch 24-hour forecast data:', error.message);
        return { success: false, error: 'Failed to process 24-hour forecast data' };
    }
}

// 4-Day Weather Forecast API Tool
async function get4DayForecastData() {
    console.log('📊 Fetching Singapore 4-Day Forecast data...');
    
    const forecastData = await fetchData('https://api.data.gov.sg/v1/environment/4-day-weather-forecast');
    
    try {
        if (forecastData.items && forecastData.items.length > 0) {
            const forecasts = forecastData.items[0].forecasts;
            const timestamp = new Date(forecastData.items[0].timestamp).toLocaleString('en-SG');
            
            return {
                success: true,
                timestamp: timestamp,
                forecasts: forecasts,
                footer: createAPIFooter('4-Day Forecast', timestamp, 'Singapore Environment APIs')
            };
        } else {
            throw new Error('No 4-day forecast data available');
        }
    } catch (error) {
        console.error('❌ Failed to fetch 4-day forecast data:', error.message);
        return { success: false, error: 'Failed to process 4-day forecast data' };
    }
}

// Function to get Weather Uncle's response
async function getWeatherUncleResponse(userMessage, username) {
    try {
        // Detect what type of data user is asking for
        const isWeatherQuery = /singapore|weather|forecast|rain|sunny|cloudy|temperature|humid/i.test(userMessage);
        const isTrafficQuery = /traffic|camera|road|jam|congestion|drive|highway|expressway|amk|bishan|orchard/i.test(userMessage);
        
        let contextualPrompt = weatherUnclePrompt;
        let apiData = [];
        let apiFooters = [];
        
        // Fetch weather data if needed
        if (isWeatherQuery) {
            const weatherData = await getWeatherData();
            
            if (weatherData.success) {
                contextualPrompt += `\n\n🔴 REAL-TIME SINGAPORE WEATHER DATA (${weatherData.timestamp}):\n${weatherData.summary}\n(This covers ${weatherData.totalAreas} areas across Singapore)\n\nYOU MUST reference this actual current weather data in your response. Don't make up weather information - use the real data provided above. Mention specific areas and their current conditions from this data.`;
                apiFooters.push(weatherData.footer);
                apiData.push('weather');
            } else {
                console.log('⚠️ Weather data fetch failed:', weatherData.error);
            }
        }
        
        // Fetch traffic data if needed
        if (isTrafficQuery) {
            const trafficData = await getTrafficData();
            
            if (trafficData.success) {
                contextualPrompt += `\n\n🔴 REAL-TIME SINGAPORE TRAFFIC CAMERA DATA (${trafficData.timestamp}):\n${trafficData.summary}\n(${trafficData.totalCameras} cameras available across Singapore)\n\nYOU MUST reference this actual current traffic camera data in your response. You can mention specific camera locations and that real-time traffic images are available from these government cameras. The cameras show current road conditions across Singapore. Each camera provides live images updated every few minutes.`;
                apiFooters.push(trafficData.footer);
                apiData.push('traffic');
            } else {
                console.log('⚠️ Traffic data fetch failed:', trafficData.error);
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
        
        // Add API proof footers
        if (apiFooters.length > 0) {
            finalResponse += apiFooters.join('');
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
