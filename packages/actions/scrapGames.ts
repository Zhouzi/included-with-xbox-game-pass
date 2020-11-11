import path from "path";
import fse from "fs-extra";
import puppeteer from "puppeteer";
import alphaSort from "alpha-sort";
import { Game } from "../types";
import currentGames from "../xgp.community/api/v1/games.json";

const OUTPUT_DIR = path.join(__dirname, "..", "xgp.community", "api", "v1");
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const DEPRECATED_OUTPUT_DIR = path.join(__dirname, "..", "gh-pages");
const XBOX_GAME_PASS_URL = "https://www.xbox.com/en-US/xbox-game-pass/games";
const SELECTORS = {
  games: `.gameList [itemtype="http://schema.org/Product"]`,
  game: {
    name: "h3",
    url: "a",
    image: "img",
    availability: {
      console: `[aria-label="Console"]`,
      pc: `[aria-label="PC"]`,
    },
  },
  currentPage: ".paginatenum.f-active",
  next: ".paginatenext:not(.pag-disabled) a",
  totalGames: ".resultsText",
  pages: ".paginatenum",
};

(async () => {
  const addedAt = new Date().toISOString();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const games: Game[] = [];
  const expectations: { games: null | number; pages: null | number } = {
    games: null,
    pages: null,
  };

  await page.goto(XBOX_GAME_PASS_URL);
  await fse.emptyDir(SCREENSHOTS_DIR);

  await (async function extractCurrentPage(): Promise<void> {
    await page.waitForSelector(SELECTORS.games);

    if (expectations.games == null || expectations.pages == null) {
      expectations.games = await page.$eval(SELECTORS.totalGames, (element) =>
        Number(element.textContent!.match(/([0-9]+) result/)![1])
      );
      expectations.pages = await page.$$eval(SELECTORS.pages, (elements) =>
        Number(elements[elements.length - 1].getAttribute("data-topage"))
      );
    }

    const currentPage = await page.$eval(SELECTORS.currentPage, (element) =>
      Number(element.getAttribute("data-topage")!)
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `page-${currentPage}.png`),
      fullPage: true,
    });

    games.push(
      ...(await page.$$eval(
        SELECTORS.games,
        (elements, selectors, addedAt) =>
          elements.map(
            (element): Game => ({
              id: element.getAttribute("data-bigid")!,
              name: element.querySelector(selectors.game.name)!.textContent!,
              url: (element.querySelector(
                selectors.game.url
              ) as HTMLAnchorElement).href,
              image: element
                .querySelector(selectors.game.image)!
                .getAttribute("src")!,
              availability: {
                console: Boolean(
                  element.querySelector(selectors.game.availability.console)
                ),
                pc: Boolean(
                  element.querySelector(selectors.game.availability.pc)
                ),
              },
              releaseDate: element.getAttribute("data-releasedate")!,
              addedAt: addedAt,
            })
          ),
        SELECTORS,
        addedAt
      ))
    );

    try {
      await page.click(SELECTORS.next);
      return extractCurrentPage();
    } catch (err) {
      if (
        currentPage !== expectations.pages ||
        games.length !== expectations.games
      ) {
        throw new Error(
          `The script ended without meeting the expectations of ${expectations.pages} pages (${currentPage}) and ${expectations.games} games (${games.length}).`
        );
      }

      games.sort((a, b) => {
        const nameSort = alphaSort.caseInsensitiveAscending(a.name, b.name);
        return nameSort === 0
          ? alphaSort.caseInsensitiveAscending(a.id, b.id)
          : nameSort;
      });
      games.forEach((game) => {
        const currentGame = currentGames.find(
          (otherGame) => otherGame.id === game.id
        );

        if (currentGame == null) {
          return;
        }

        // do not update the addedAt date if the game was already included
        game.addedAt = currentGame.addedAt;
      });

      await fse.writeJSON(path.join(OUTPUT_DIR, "games.json"), games, {
        spaces: 2,
      });
      await fse.copyFile(
        path.join(OUTPUT_DIR, "games.json"),
        path.join(DEPRECATED_OUTPUT_DIR, "games.json")
      );
    }
  })();

  browser.close();
})();
