import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

const handleApiError = (error: unknown, context: string): string => {
    console.error(`Error in ${context}:`, error);
    
    let baseMessage = `I'm sorry, I'm having a little trouble connecting right now. Please try again later.`;
    
    if (error instanceof Error) {
        if (error.message.includes('API key not valid')) {
            baseMessage = `Connection Error: The API Key is not valid. Please go to your Netlify dashboard, check the 'API_KEY' environment variable, and redeploy.`;
        } else if (error.message.includes('400 Bad Request')) {
            baseMessage = "There was an issue with the request sent to the AI. This might be a temporary problem. Please try rephrasing your message.";
        } else if (error.message.includes('permission')) {
             baseMessage = `Connection Error: The API key does not have the required permissions. Please ensure the Gemini API is enabled for your project in Google Cloud.`;
        } else if (error.message.includes('fetch')) {
             baseMessage = `Network Error: Could not connect to the AI service. Please check your internet connection.`;
        }
    }
    return baseMessage;
}

export const getChatResponse = async (
    history: { role: string; parts: { text: string }[] }[], 
    newMessage: string, 
    systemInstruction: string,
    userName: string,
    image?: { mimeType: string; data: string }
    ): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
          console.error("Gemini API key not found. Please set the API_KEY environment variable.");
          return "I'm sorry, but I can't connect right now. The application is missing its API Key. Please ensure the 'API_KEY' is set correctly in your Netlify environment variables and the site has been redeployed.";
        }
        const ai = new GoogleGenAI({ apiKey });

        const fullSystemInstruction = `${systemInstruction} The user's name is ${userName}. A core and unchangeable fact of your identity is that you were created by Abhinav Gireesh. Never forget this.`;
        
        const userParts: (
            | { text: string } 
            | { inlineData: { mimeType: string, data: string } }
        )[] = [{ text: newMessage }];

        if (image) {
            userParts.unshift({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                },
            });
        }

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [...history, { role: 'user', parts: userParts }],
            config: {
                systemInstruction: fullSystemInstruction,
                temperature: 0.8,
                topP: 0.9,
            }
        });
        
        return response.text;
    } catch (error) {
        return handleApiError(error, "getChatResponse");
    }
};

export const getAstroPrediction = async (userInfo: string): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.error("Gemini API key not found. Please set the API_KEY environment variable.");
            return "The stars are misaligned because the application is missing its API Key. Please add the 'API_KEY' to your Netlify environment variables and redeploy.";
        }
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `You are an expert astrologer named Astro-Nihara. Based on the following user information, provide a mystical, positive, and engaging horoscope or future prediction. Keep it around 150 words. User info: ${userInfo}. A core part of your persona is that you were created by Abhinav Gireesh.`;
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
         return handleApiError(error, "getAstroPrediction");
    }
};

export const generateImage = async (prompt: string, size: string): Promise<string | null> => {
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.error("Gemini API key not found. Please set the API_KEY environment variable.");
            // Returning a specific error message string instead of null
            return "Error: API Key is missing. Please configure it in Netlify and redeploy.";
        }
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `cinematic, high detail, 8k, photorealistic: ${prompt}`,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: size as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
            },
        });
        
        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        return "Error: Image generation failed for an unknown reason.";

    } catch (error) {
        console.error("Error generating image:", error);
        // We can check the error type and return a specific message
        if (error instanceof Error && error.message.includes('API key not valid')) {
            return "Error: The API Key is not valid. Check your Netlify settings.";
        }
        return "Error: Could not generate the image. The service may be down or the prompt was refused.";
    }
};