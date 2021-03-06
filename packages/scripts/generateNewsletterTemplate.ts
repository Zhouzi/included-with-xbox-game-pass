import puppeteer from "puppeteer";
import mjml from "mjml";
import axios from "axios";
import path from "path";
import fse from "fs-extra";
import { format } from "date-fns";
import marked from "marked";
import { Game } from "@included-with-xbox-game-pass/types";

import games from "../website/static/games.json";

const OUTPUT_DIR = path.join(
  __dirname,
  "..",
  "website",
  "static",
  "newsletter"
);
const IS_DEV = ["--dev", "-D"].includes(process.argv[2]);

(async function generateNewsletterTemplate() {
  let since = new Date();
  since.setDate(since.getDate() - 7);

  if (!IS_DEV) {
    if (process.env.SENDINBLUE_API_KEY == null) {
      throw new Error("Missing SENDINBLUE_API_KEY environment variable");
    }

    const {
      data: { campaigns },
    } = await axios.get<{ campaigns: Array<{ createdAt: string }> }>(
      "/emailCampaigns",
      {
        params: {
          status: "sent",
          limit: 1,
        },
        baseURL: "https://api.sendinblue.com/v3/",
        headers: {
          "api-key": process.env.SENDINBLUE_API_KEY,
        },
      }
    );
    const lastCampaign = campaigns[0];
    since = new Date(lastCampaign.createdAt);
  }

  const newGames: Game[] = games.filter(
    (game) => new Date(game.updatedAt).getTime() > since.getTime()
  );
  const newPosts: Post[] = await scrapPosts(since);
  const content = marked(
    fse.readFileSync(path.join(__dirname, "newsletter.md"), "utf-8")
  );
  const { html, errors } = mjml(
    `
  <mjml>
    <mj-head>
      <mj-attributes>
        <mj-text font-size="14px" color="#BAC5CE" line-height="1.6" />
      </mj-attributes>
      <mj-style inline="inline">
        p {
          margin: 0 0 14px 0;
        }
        p:last-child {
          margin-bottom: 0;
        }
        strong {
          color: #fff;
          font-weight: bold;
        }

        a {
          color: #44f089;
          text-decoration: none;
        }

        .SectionTitle {
          text-transform: uppercase;
          font-size: 12px;
          font-weight:
            bold;
          letter-spacing: 0.6px;
          color: #44f089;
        }

        h2 {
          color: #fff;
          font-size: 18px;
          font-weight: bold;
          margin: 0;
          line-height: 1.3;
        }
        h2 a {
          color: inherit;
        }
      </mj-style>
    </mj-head>
    <mj-body background-color="#0F1923">
      <mj-section padding="28px 14px 0 14px">
        <mj-column>
          <mj-image href="https://included-with-xbox-game-pass.gabin.app" src="https://included-with-xbox-game-pass.gabin.app/images/logo.png" width="187px" padding="0" align="left" />
          <mj-text padding="6px 0 0 0">
            <p>Weekly digest of all things Xbox Game Pass.</p>
          </mj-text>
        </mj-column>
      </mj-section>

      <mj-section padding="28px 14px 0 14px">
        <mj-column padding="14px" background-color="#182735" border-radius="6px">
          <mj-text font-size="16px" padding="0 0 14px 0">
            ${content}
          </mj-text>
        </mj-column>
      </mj-section>

      ${
        newPosts.length > 0
          ? `
        <mj-section padding="28px 14px 14px 14px">
          <mj-column>
            <mj-text padding="0">
              <p class="SectionTitle">New posts</p>
            </mj-text>
          </mj-column>
        </mj-section>
        ${newPosts
          .map(
            (post) => `
        <mj-section padding="0 14px 14px 14px">
          <mj-column width="75%">
            <mj-text padding="0 14px 14px 0">
              <h2><a href="${post.url}">${post.title}</a></h2>
              <p>${format(new Date(post.publishedAt), "MMM d, y")}</p>
            </mj-text>
          </mj-column>
          <mj-column width="25%">
            <mj-image
              padding="0"
              width="100px"
              href="${post.url}"
              src="${post.image}"
            ></mj-image>
          </mj-column>
        </mj-section>
        `
          )
          .join("\n")}
      `
          : ""
      }

      ${
        newGames.length > 0
          ? `
        <mj-section padding="14px 14px 0 14px">
          <mj-column width="100%">
            <mj-text padding="0 0 14px 0">
              <p class="SectionTitle">Added this week</p>
            </mj-text>
          </mj-column>
          ${newGames
            .map(
              (game) => `
            <mj-column width="50%" padding="0 14px 14px 0">
              <mj-text padding="0">
                <h2><a href="${
                  game.availability.pc ?? game.availability.console
                }">${game.name}</a></h2>
                <p>Available on: ${[
                  game.availability.pc && "PC",
                  game.availability.console && "Console",
                ]
                  .filter(Boolean)
                  .join(", ")}</p>
              </mj-text>
            </mj-column>
          `
            )
            .join("\n")}
          ${
            newGames.length % 2 !== 0
              ? `<mj-column width="50%" padding="0 0 14px 0"></mj-column>`
              : ""
          }
        </mj-section>
      `
          : ""
      }

      <mj-section padding="28px 14px 28px 14px">
        <mj-column>
          <mj-text padding="0">
            <p>
              This newsletter is part of <a href="https://included-with-xbox-game-pass.gabin.app">included-with-xbox-game-pass</a>, a side
              project by <a href="https://gabinaureche.com">Gabin</a>. Do not hesitate to reply to this
              email if you have any feedback to share.
            </p>
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `,
    {
      minify: true,
    }
  );

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  }

  await fse.writeFile(path.join(OUTPUT_DIR, "next.html"), html);
})();

interface Post {
  title: string;
  publishedAt: string;
  url: string;
  image: string;
}

async function scrapPosts(since: Date): Promise<Post[]> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const posts: Post[] = [];

  await page.goto("https://news.xbox.com/en-US/xbox-game-pass/");

  await (async function scrapCurrentPageAndGoNext(): Promise<void> {
    await page.waitForSelector(".media.feed");

    posts.push(
      ...(await page.$$eval(".media.feed", (elements) =>
        elements.map((element) => ({
          url: element.querySelector(".feed__title a")!.getAttribute("href")!,
          title: element.querySelector(".feed__title")!.textContent!.trim(),
          publishedAt: element.querySelector("time")!.getAttribute("datetime")!,
          image: element
            .querySelector(".media-image img")!
            .getAttribute("src")!,
        }))
      ))
    );

    const lastPost = posts[posts.length - 1];
    if (new Date(lastPost.publishedAt).getTime() > since.getTime()) {
      await page.click(".next.page-numbers");
      return scrapCurrentPageAndGoNext();
    }
  })();

  browser.close();

  const newPosts = posts.filter(
    (post) => new Date(post.publishedAt).getTime() > since.getTime()
  );

  return newPosts;
}
