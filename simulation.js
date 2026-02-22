const axios = require('axios');
const qs = require('qs');

const BASE_URL = 'http://localhost:3000';

async function simulateCall() {
    console.log('--- 📞 Starting Simulated Call ---');

    try {
        // 1. Initial Call (/voice)
        console.log('\n[1] Initializing Call...');
        const initResponse = await axios.post(`${BASE_URL}/voice`, qs.stringify({
            CallSid: 'SIM_CALL_123'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('Server Response (TwiML):');
        console.log(initResponse.data);

        // 2. User says something (/respond)
        const userInput = "Hello, I have a question about my bill.";
        console.log(`\n[2] User says: "${userInput}"`);
        const respondResponse = await axios.post(`${BASE_URL}/respond`, qs.stringify({
            CallSid: 'SIM_CALL_123',
            SpeechResult: userInput
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('AI Voice Agent Response:');
        console.log(respondResponse.data);

        // 3. Check Dashboard
        console.log('\n[3] Checking Dashboard...');
        const dashboardResponse = await axios.get(`${BASE_URL}/dashboard`);
        console.log('Dashboard content received. Check it in your browser at: http://localhost:3000/dashboard');

    } catch (error) {
        console.error('Error during simulation:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('ERROR: Is your server running? Run "npm start" in another terminal first.');
        }
    }
}

simulateCall();
