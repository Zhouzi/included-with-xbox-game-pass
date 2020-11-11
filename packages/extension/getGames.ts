import storageCache from "webext-storage-cache";
import { Game } from "../types";

const API_HOST =
  process.env.NODE_ENV === "production"
    ? "https://xgp.community/api/v1/"
    : "http://localhost:1234/api/v1/";
const API_ENDPOINT = new URL("./games.json", API_HOST).href;

// The response's API is cached so the cache might fall out of date at some point.
// By copying Game, we are making sure Typescript will throw an error if we were
// to use something that is available in the API but not in the cache.
// When that happens, the idea is to update both CachedGame and shouldRevalidate
interface CachedGame {
  id: string;
  name: string;
  url: string;
  image: string;
  availability: {
    console: boolean;
    pc: boolean;
  };
  releaseDate: string;
  addedAt: string;
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
    shouldRevalidate: (games) => games.some((game) => game.addedAt == null),
  }
);
