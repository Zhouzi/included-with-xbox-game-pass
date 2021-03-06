import storageCache from "webext-storage-cache";
import { Game } from "@included-with-xbox-game-pass/types";

const API_HOST =
  process.env.NODE_ENV === "production"
    ? "https://included-with-xbox-game-pass.gabin.app/"
    : "http://localhost:1234/";
const API_ENDPOINT = new URL("./games.json", API_HOST).href;

// The response's API is cached so the cache might fall out of date at some point.
// By copying Game, we are making sure Typescript will throw an error if we were
// to use something that is available in the API but not in the cache.
export interface CachedGame {
  name: string;
  availability: {
    console: string;
    pc: string;
  };
  steam: number | null;
}

export default storageCache.function<
  CachedGame[],
  () => Promise<CachedGame[]>,
  never
>(
  async () => {
    const res = await fetch(API_ENDPOINT);
    const json: Game[] = await res.json();

    return json;
  },
  {
    maxAge: {
      days: 1,
    },
    cacheKey: () => "games",
  }
);
