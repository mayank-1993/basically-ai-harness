import OpenAI from "openai";
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY is missing. Copy .env.example to .env and add a key from https://platform.openai.com/api-keys",
  );
}

export const client = new OpenAI({ apiKey });
