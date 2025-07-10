# Junaid AI - Enterprise AI Assistant

Junaid AI is a professional, enterprise-ready AI assistant built with a modern and clean user interface. It is designed to be a secure and scalable chat application that connects to any OpenAI-compatible API.

## Features

- **Modern UI/UX**: Clean, professional, and responsive design.
- **Enterprise Ready**: Built with best practices for stability and security.
- **Extensible**: Easily add new features and functionality.
- **Markdown Support**: Renders AI responses in Markdown for better readability.
- **Secure Serverless Backend**: Uses a Vercel serverless function to securely proxy requests to the AI service.
- **"Coming Soon" Placeholders**: Easily manage user expectations for upcoming features.

## Tech Stack

- **Frontend**: HTML, Tailwind CSS, JavaScript
- **Backend**: Node.js (via Vercel Serverless Function)
- **AI**: OpenAI-compatible API

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en/) (for local development)
- A Vercel account for deployment.
- Access to an OpenAI-compatible API with an API key.

### Deployment

1.  **Fork this repository** to your GitHub account.
2.  **Clone your forked repository** to your local machine.
3.  **Create a new project on Vercel** and connect it to your forked repository.
4.  **Set up Environment Variables** in your Vercel project settings:
    * `API_KEY`: Your secret key for the AI service.
    * `API_BASE_URL`: The base URL of the OpenAI-compatible API.
    * `API_MODEL`: The model you want to use (e.g., `gpt-3.5-turbo`).
    * `SYSTEM_PROMPT_CONTENT`: The initial system prompt to guide the AI's behavior. For example: `You are Junaid AI, a helpful and professional AI assistant from Pakistan.`
5.  **Deploy!** Vercel will automatically build and deploy your application.

## How It Works

The application is composed of two main parts:

1.  **`index.html`**: The main user interface. It handles user input, displays the conversation, and communicates with the backend.
2.  **`api/chat.js`**: A Vercel serverless function that acts as a secure backend. It receives requests from the frontend, validates them, and then forwards them to the AI service. This approach ensures that your `API_KEY` remains secret and is never exposed to the client.

## Contributing

Contributions are welcome! If you have suggestions or want to improve the application, feel free to open an issue or submit a pull request.