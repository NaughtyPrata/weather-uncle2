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

// Helper function to create comprehensive API footer
function createComprehensiveAPIFooter(apiList, timestamp) {
    if (apiList.length === 0) return '';
    
    const uniqueAPIs = [...new Set(apiList)]; // Remove duplicates
    const plural = uniqueAPIs.length > 1 ? 'APIs' : 'API';
    
    return `\n\n📊 *Live data from ${uniqueAPIs.length} Singapore Government ${plural}: ${uniqueAPIs.join(', ')} (${timestamp})*`;
}

// ═══════════════════════════════════════════════════════════════════
// TELEGRAM UI CARD SYSTEM
// ═══════════════════════════════════════════════════════════════════

// Weather UI Card Components
function createWeatherCard(weatherData, analysisData = null) {
    const timestamp = new Date().toLocaleString('en-SG');
    
    let card = `🌤️ *SINGAPORE WEATHER DASHBOARD*\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `📅 ${timestamp}\n\n`;
    
    // Current Conditions Section
    if (weatherData && weatherData.success) {
        card += `🌡️ *CURRENT CONDITIONS*\n`;
        card += `├ Temperature: ${weatherData.temperature || 'N/A'}°C\n`;
        card += `├ Humidity: ${weatherData.humidity || 'N/A'}%\n`;
        card += `├ Wind: ${weatherData.windSpeed || 'N/A'} km/h\n`;
        card += `└ Rainfall: ${weatherData.rainfall || 0}mm\n\n`;
    }
    
    return card;
}

function createAirQualityCard(psi, pm25, uvIndex) {
    let card = `🌫️ *AIR QUALITY INDEX*\n`;
    card += `├ PSI: ${psi || 'N/A'} ${getPSIStatus(psi)}\n`;
    card += `├ PM2.5: ${pm25 || 'N/A'} μg/m³\n`;
    card += `└ UV Index: ${uvIndex || 'N/A'} ${getUVStatus(uvIndex)}\n\n`;
    
    return card;
}

function createForecastCard(forecast2h, forecast24h) {
    let card = `🔮 *WEATHER FORECAST*\n`;
    if (forecast2h) {
        card += `├ Next 2 Hours: ${forecast2h}\n`;
    }
    if (forecast24h) {
        card += `└ Next 24 Hours: ${forecast24h}\n`;
    }
    card += `\n`;
    
    return card;
}

function createSafetyCard(analysisData) {
    if (!analysisData) return '';
    
    let card = `🛡️ *SAFETY ANALYSIS*\n`;
    
    if (analysisData.type === 'jogging') {
        const status = analysisData.safe ? '✅ SAFE' : '❌ UNSAFE';
        card += `🏃 Jogging: ${status}\n`;
        if (!analysisData.safe) {
            card += `⚠️ Reasons: ${analysisData.reasons.join(', ')}\n`;
        }
    } else if (analysisData.type === 'outdoor') {
        const status = analysisData.safe ? '✅ SAFE' : '❌ UNSAFE';
        card += `🚴 Outdoor Activities: ${status}\n`;
        if (!analysisData.safe) {
            card += `⚠️ Warnings: ${analysisData.warnings.join(', ')}\n`;
        }
    }
    
    card += `\n`;
    return card;
}

function createInteractiveKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '🏃 Jogging Safety', callback_data: 'check_jogging' },
                { text: '👶 Child Play', callback_data: 'check_children' }
            ],
            [
                { text: '👕 Laundry Time', callback_data: 'check_laundry' },
                { text: '🧺 Picnic Plans', callback_data: 'check_picnic' }
            ],
            [
                { text: '🌧️ Rain Forecast', callback_data: 'check_rain' },
                { text: '🌫️ Haze Risk', callback_data: 'check_haze' }
            ],
            [
                { text: '🔄 Refresh Data', callback_data: 'refresh_weather' },
                { text: '📊 Full Report', callback_data: 'full_analysis' }
            ]
        ]
    };
}

// Status helper functions
function getPSIStatus(psi) {
    if (!psi) return '';
    if (psi <= 50) return '🟢 Good';
    if (psi <= 100) return '🟡 Moderate';
    if (psi <= 200) return '🟠 Unhealthy';
    return '🔴 Hazardous';
}

function getUVStatus(uv) {
    if (!uv) return '';
    if (uv <= 2) return '🟢 Low';
    if (uv <= 5) return '🟡 Moderate';
    if (uv <= 7) return '🟠 High';
    if (uv <= 10) return '🔴 Very High';
    return '🟣 Extreme';
}

function createComprehensiveWeatherCard(allData) {
    const timestamp = new Date().toLocaleString('en-SG');
    
    let card = `🌤️ *SINGAPORE WEATHER DASHBOARD*\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `📅 ${timestamp}\n\n`;
    
    // Environmental Data
    card += `🌡️ *ENVIRONMENTAL CONDITIONS*\n`;
    card += `├ Temperature: ${allData.temperature || 'N/A'}°C\n`;
    card += `├ Humidity: ${allData.humidity || 'N/A'}%\n`;
    card += `├ Wind Speed: ${allData.windSpeed || 'N/A'} km/h\n`;
    card += `└ Rainfall: ${allData.rainfall || 0}mm\n\n`;
    
    // Air Quality
    card += createAirQualityCard(allData.psi, allData.pm25, allData.uvIndex);
    
    // Forecasts
    if (allData.forecast2h || allData.forecast24h) {
        card += createForecastCard(allData.forecast2h, allData.forecast24h);
    }
    
    // Quick Safety Summary
    card += `🛡️ *QUICK SAFETY CHECK*\n`;
    card += `├ Outdoor Safety: ${allData.psi > 100 || allData.uvIndex > 8 || allData.rainfall > 5 ? '❌ Use Caution' : '✅ Safe'}\n`;
    card += `├ Air Quality: ${allData.psi > 100 ? '❌ Poor' : '✅ Good'}\n`;
    card += `└ UV Protection: ${allData.uvIndex > 7 ? '❌ Required' : '✅ Optional'}\n\n`;
    
    return card;
}

// Weather Dashboard Generator
async function generateWeatherDashboard(chatId, messageId = null) {
    try {
        console.log('📊 Fetching comprehensive weather data for dashboard...');
        
        // Fetch all necessary data
        const [psiData, uvData, rainfallData, humidityData, windData, tempData, forecast2hData, forecast24hData] = await Promise.all([
            getPSIData(),
            getUVIndexData(),
            getRainfallData(),
            getHumidityData(),
            getWindSpeedData(),
            getTemperatureData(),
            get2HourForecastData(),
            get24HourForecastData()
        ]);
        
        // Compile all data
        const allData = {
            psi: psiData.success ? Math.max(...(psiData.readings?.map(r => r.value) || [0])) : null,
            uvIndex: uvData.success ? Math.max(...(uvData.readings?.map(r => r.value) || [0])) : null,
            rainfall: rainfallData.success ? Math.max(...(rainfallData.readings?.map(r => r.value) || [0])) : null,
            humidity: humidityData.success ? Math.max(...(humidityData.readings?.map(r => r.value) || [0])) : null,
            windSpeed: windData.success ? Math.max(...(windData.readings?.map(r => r.value) || [0])) : null,
            temperature: tempData.success ? Math.max(...(tempData.readings?.map(r => r.value) || [0])) : null,
            forecast2h: forecast2hData.success && forecast2hData.forecasts?.length > 0 ? 
                forecast2hData.forecasts[0].forecast : null,
            forecast24h: forecast24hData.success && forecast24hData.general?.forecast ? 
                forecast24hData.general.forecast : null,
            pm25: null // We can add PM2.5 if needed
        };
        
        // Generate comprehensive weather card
        const dashboardCard = createComprehensiveWeatherCard(allData);
        
        // Create interactive keyboard
        const keyboard = createInteractiveKeyboard();
        
        // Track APIs used
        const usedAPIs = ['PSI API', 'UV Index API', 'Rainfall API', 'Humidity API', 'Wind Speed API', 'Air Temperature API', '2-Hour Forecast API', '24-Hour Forecast API'];
        const timestamp = new Date().toLocaleString('en-SG');
        const footer = createComprehensiveAPIFooter(usedAPIs, timestamp);
        
        const fullMessage = dashboardCard + footer;
        
        // Send dashboard with interactive keyboard
        await bot.sendMessage(chatId, fullMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
            reply_to_message_id: messageId
        });
        
        console.log('✅ Weather dashboard sent successfully');
        
    } catch (error) {
        console.error('❌ Error generating dashboard:', error.message);
        await bot.sendMessage(chatId, '❌ Sorry, I encountered an error generating the weather dashboard. Please try again!', {
            reply_to_message_id: messageId
        });
    }
}

// Handle callback queries from interactive buttons
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const username = callbackQuery.from.username || callbackQuery.from.first_name;
    
    console.log(`🔘 Button pressed by @${username}: ${data}`);
    
    try {
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendChatAction(chatId, 'typing');
        
        let response = '';
        
        switch(data) {
            case 'check_jogging':
                const joggingData = await checkJoggingSafety();
                if (joggingData.success) {
                    response = `🏃 *JOGGING SAFETY ANALYSIS*\n\n${joggingData.safe ? '✅ SAFE TO JOG' : '❌ NOT SAFE TO JOG'}\n\n`;
                    response += `📊 *Analysis:*\n${joggingData.reasons.join('\n')}\n\n`;
                    response += `📈 *Current Data:*\nUV Index: ${joggingData.data.uvIndex}\nPSI: ${joggingData.data.psi}\nRainfall: ${joggingData.data.rainfall}mm`;
                    response += createComprehensiveAPIFooter(joggingData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'check_children':
                const childData = await checkChildPlaySafety();
                if (childData.success) {
                    response = `👶 *CHILD PLAY SAFETY ANALYSIS*\n\n${childData.safe ? '✅ SAFE FOR CHILDREN' : '❌ NOT SAFE FOR CHILDREN'}\n\n`;
                    response += `📊 *Analysis:*\n${childData.reasons.join('\n')}\n\n`;
                    response += `📈 *Current Data:*\nUV Index: ${childData.data.uvIndex}\nPSI: ${childData.data.psi}`;
                    response += createComprehensiveAPIFooter(childData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'check_laundry':
                const laundryData = await checkLaundryConditions();
                if (laundryData.success) {
                    response = `👕 *LAUNDRY CONDITIONS ANALYSIS*\n\n${laundryData.suitable ? '✅ GOOD FOR LAUNDRY' : '❌ NOT SUITABLE FOR LAUNDRY'}\n\n`;
                    response += `📊 *Analysis:*\n${laundryData.reasons.join('\n')}\n\n`;
                    response += `📈 *Current Data:*\nRainfall: ${laundryData.data.rainfall}mm\nHumidity: ${laundryData.data.humidity}%\nRain Forecast: ${laundryData.data.hasRainForecast ? 'Yes' : 'No'}`;
                    response += createComprehensiveAPIFooter(laundryData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'check_picnic':
                const picnicData = await checkPicnicConditions();
                if (picnicData.success) {
                    response = `🧺 *PICNIC CONDITIONS ANALYSIS*\n\n${picnicData.suitable ? '✅ SUITABLE FOR PICNIC' : '❌ NOT SUITABLE FOR PICNIC'}\n\n`;
                    response += `📊 *Risk Level:* ${picnicData.riskLevel}\n`;
                    response += `🌧️ *Rain Signal Score:* ${picnicData.rainSignal}/3`;
                    response += createComprehensiveAPIFooter(picnicData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'check_rain':
                const rainData = await predictRain();
                if (rainData.success) {
                    response = `🌧️ *RAIN PREDICTION ANALYSIS*\n\n📊 *${rainData.likelihood}*\n\n`;
                    if (rainData.indicators.length > 0) {
                        response += `⚠️ *Indicators:*\n${rainData.indicators.join('\n')}\n\n`;
                    }
                    response += `📈 *Current Data:*\nRainfall: ${rainData.data.rainfall}mm\nHumidity: ${rainData.data.humidity}%\n2h Forecast: ${rainData.data.rain2h || 'No rain'}\n24h Forecast: ${rainData.data.rain24h || 'No rain'}`;
                    response += createComprehensiveAPIFooter(rainData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'check_haze':
                const hazeData = await checkHazeRisk();
                if (hazeData.success) {
                    response = `🌫️ *HAZE RISK ANALYSIS*\n\n📊 *${hazeData.risk}*\n\n`;
                    response += `💡 *Explanation:* ${hazeData.explanation}\n\n`;
                    response += `📈 *Current Data:*\nPSI: ${hazeData.data.psi}\nWind Speed: ${hazeData.data.windSpeed} km/h`;
                    response += createComprehensiveAPIFooter(hazeData.apis, new Date().toLocaleString('en-SG'));
                }
                break;
                
            case 'refresh_weather':
                await generateWeatherDashboard(chatId);
                return;
                
            case 'full_analysis':
                response = "🤖 *Full Analysis Available!*\n\nFor comprehensive analysis, ask me about:\n• Jogging safety\n• Child play conditions\n• Laundry timing\n• Picnic planning\n• Rain predictions\n• Haze risks\n• Outdoor activities\n• Comfort levels\n\nOr use the buttons above for quick checks!";
                break;
                
            default:
                response = "🤖 Weather Uncle is here to help! Use the buttons above for quick weather analysis.";
        }
        
        if (response) {
            await bot.sendMessage(chatId, response, {
                parse_mode: 'Markdown'
            });
        }
        
        console.log(`✅ Callback handled for @${username}: ${data}`);
        
    } catch (error) {
        console.error('❌ Error handling callback:', error.message);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: "❌ Error processing request. Please try again!",
            show_alert: true
        });
    }
});

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

        // Check for dashboard command
        if (userMessage.toLowerCase().includes('/dashboard') || 
            userMessage.toLowerCase().includes('show dashboard') ||
            userMessage.toLowerCase().includes('weather dashboard') ||
            userMessage.toLowerCase().includes('full report')) {
            
            console.log('🎛️ Generating weather dashboard UI card...');
            await generateWeatherDashboard(chatId, msg.message_id);
            return;
        }

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
