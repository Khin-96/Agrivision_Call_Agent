const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize Hugging Face configuration
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "Qwen/Qwen2.5-VL-7B-Instruct";
const HF_API_URL = `https://router.huggingface.co/v1/chat/completions`;

// System Prompt for Qwen
const SYSTEM_PROMPT = "You are a helpful, professional customer support voice assistant. Keep your responses concise and natural for a phone conversation. Avoid using markdown or special characters that are hard to read aloud. If the user wants to end the call, say goodbye politely.";

// In-memory store for conversation history (CallSid -> Array of messages)
const sessions = {};

// Root route for health check
app.get('/', (req, res) => {
    res.send('HF-Powered AI Voice Agent is running!');
});

// 1. Initial Call Handler: Triggered when someone dials the Twilio number
app.post('/voice', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;

    console.log(`Incoming call: ${callSid}`);

    // Initialize session with simple system prompt
    sessions[callSid] = [
        { role: "system", content: SYSTEM_PROMPT }
    ];

    const greeting = "Hello! This is your customer assistant. How can I help you today?";

    twiml.say({
        voice: 'Polly.Joanna-Neural',
    }, greeting);

    // Initial message from assistant
    sessions[callSid].push({ role: "assistant", content: greeting });

    // Prompt for user input
    twiml.gather({
        input: 'speech',
        action: '/respond',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US',
        enhanced: true
    });

    twiml.say("I'm still here if you need help.");
    twiml.gather({
        input: 'speech',
        action: '/respond',
        method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
});

// 2. Response Handler: Processes the transcribed speech and gets AI response from HF
app.post('/respond', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const speechResult = req.body.SpeechResult;
    const callSid = req.body.CallSid;

    console.log(`Speech detected from ${callSid}: ${speechResult}`);

    if (!speechResult) {
        twiml.say("I'm sorry, I didn't catch that. Could you please repeat?");
        twiml.gather({
            input: 'speech',
            action: '/respond',
            method: 'POST'
        });
        res.type('text/xml');
        return res.send(twiml.toString());
    }

    try {
        if (!sessions[callSid]) {
            sessions[callSid] = [{ role: "system", content: SYSTEM_PROMPT }];
        }

        const history = sessions[callSid];
        history.push({ role: "user", content: speechResult });

        // Call Hugging Face API using OpenAI-compatible Chat Completions
        const hfResponse = await axios.post(
            HF_API_URL,
            {
                model: HF_MODEL,
                messages: history,
                max_tokens: 150,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let responseText = "";
        if (hfResponse.data.choices && hfResponse.data.choices[0].message) {
            responseText = hfResponse.data.choices[0].message.content.trim();
        } else {
            responseText = "I'm sorry, I'm having trouble processing that right now.";
        }

        // Clean up any AI artifacts
        responseText = responseText.replace(/^(Assistant:|AI:|Output:)/i, "").trim();

        history.push({ role: "assistant", content: responseText });

        console.log(`HF Response for ${callSid}: ${responseText}`);

        twiml.say({
            voice: 'Polly.Joanna-Neural',
        }, responseText);

        const lowerResponse = responseText.toLowerCase();
        if (lowerResponse.includes("goodbye") || lowerResponse.includes("bye-bye") || lowerResponse.includes("have a great day")) {
            twiml.hangup();
        } else {
            twiml.gather({
                input: 'speech',
                action: '/respond',
                method: 'POST',
                speechTimeout: 'auto',
                language: 'en-US'
            });
        }
    } catch (error) {
        console.error("Error processing HF response:", error.response?.data || error.message);
        twiml.say("I'm having a bit of trouble connecting. Can you say that again?");
        twiml.gather({
            input: 'speech',
            action: '/respond',
            method: 'POST'
        });
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// 3. Status Handler: Cleanup session when call ends
app.post('/status', (req, res) => {
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;

    if (['completed', 'failed', 'busy', 'no-answer'].includes(callStatus)) {
        delete sessions[callSid];
        console.log(`Session ended and cleaned up for: ${callSid}`);
    }

    res.sendStatus(200);
});

// Dashboard route to view active sessions
app.get('/dashboard', (req, res) => {
    let dashboardHtml = `
        <html>
            <head>
                <title>AI Voice Agent Dashboard</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
                    .card { background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    h1 { color: #333; }
                    .meta { color: #666; font-size: 0.8em; }
                    .msg { margin: 5px 0; }
                    .user { color: blue; }
                    .model { color: green; }
                </style>
            </head>
            <body>
                <h1>Active Session Logs</h1>
    `;

    const sids = Object.keys(sessions);
    if (sids.length === 0) {
        dashboardHtml += '<p>No active sessions.</p>';
    } else {
        sids.forEach(sid => {
            dashboardHtml += `<div class="card">
                <div class="meta">Call SID: ${sid}</div>
                <hr>`;
            sessions[sid].forEach(msg => {
                const content = msg.content || "";
                dashboardHtml += `<div class="msg ${msg.role}"><strong>${msg.role.toUpperCase()}:</strong> ${content}</div>`;
            });
            dashboardHtml += '</div>';
        });
    }

    dashboardHtml += '</body></html>';
    res.send(dashboardHtml);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Expose this port to the internet to receive Twilio webhooks.`);
});
