# SmartCompose+

SmartCompose+ is a **full-stack browser extension** for Chromium-based browsers that integrates with Gmail, enabling **AI-powered email writing, replying, and selective rewriting**.  

## 🚀 Features
- ✉️ **AI Reply & Write** → Compose context-aware responses or new emails based on user intent.  
- 🎭 **Tone & Length Customization** → Adjust the AI’s writing style dynamically.  
- ✂️ **Selective Rewrite** → Rewrite highlighted text using JavaScript’s Selection & Range APIs.  
- 🧑‍💻 **Personalized AI Responses** → Learns from user’s past writing samples (persisted in MySQL, cached in Redis).  
- ⚡ **Low-latency Streaming** → Real-time output with **Server-Sent Events (SSE)**.  
- 🔐 **Stateful OAuth2 Authorization** → Secure login, user data in MySQL, sessions cached in Redis.  
- 📊 **Scalable Rate Limiting** → Redis-backed quota enforcement per user (per-minute, per-day).  

## 🏗️ Architecture
- **Frontend**: Browser extension (JavaScript, DOM APIs).  
- **Backend**: Spring Boot + Redis + MySQL.  
- **AI Layer**: Gemini API (rate-limited & personalized).  


## ⚡ Tech Stack
- **Languages**: JavaScript, Java, SQL  
- **Frameworks/DBs**: Spring Boot, Redis, MySQL  
- **APIs**: Gemini (text generation)  

## 📦 Installation
1. Clone the repo.  
2. Run backend (`Spring Boot + Redis + MySQL`).  
3. Load extension in Chrome (Developer Mode → Load Unpacked).  

## 🎥 Demo
[▶ Watch here](https://youtu.be/vKXfi-yOfqs)

## 📜 License
MIT
