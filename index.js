import fs from 'fs';
import csv from 'fast-csv';
import path from 'path';
import request from 'request';
import jsdom from "jsdom";
import fetch from 'node-fetch';

import puppeteer from 'puppeteer';
import reviews from './test.json';
import maleNames from './maleNames.json';
import femaleNames from './femaleNames.json';
import lastNames from './lastNames.json';

const __dirname = path.resolve();

async function postReview(productPageUrl, review, index){
  const browser = await puppeteer.launch({headless: false,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ]});

  const page = await browser.newPage();
  await page.goto(productPageUrl);
  await page.waitForSelector('iframe#looxReviewsFrame')
  const framefinal = await page.frames().find(frame => frame.name() === 'looxReviewsFrame');
  await framefinal.click('#header button#write');
  try {
    await page.waitForSelector('#looxOverlay_looxDialog', { timeout: 10000 })
  } catch(err) {
    await browser.close();
    await postReview(productPageUrl, review);
  }

  const elementHandle = await page.$('#looxOverlay_looxDialog iframe');
  const frame = await elementHandle.contentFrame();
  await frame.waitForSelector('div[data-phase-title="rate-item"]', { visible: true });
  const element = await frame.$('div[data-phase-title="rate-item"]');
  await page.evaluate(async(review) => {
    const iframe = document.querySelector('#looxOverlay_looxDialog iframe');

    iframe.contentWindow.document.body.querySelectorAll('div[data-phase-title="rate-item"] div')[5 - review.starNumber].click();
  }, review)

  await frame.waitForSelector('label[for="imageupload"]', { visible: true });
  const teste = await frame.$('input#imageupload');
  teste.uploadFile(`images/0${index}/00.jpeg`);

  await frame.waitForSelector('textarea#review', { visible: true });
  await page.evaluate(async(review) => {
    const iframe = document.querySelector('#looxOverlay_looxDialog iframe');
    iframe.contentWindow.document.body.querySelector('textarea#review').value = review.reviewText;
    iframe.contentWindow.document.body.querySelector('div[data-phase-title="textual-review"] .button').click();
  }, review)

 await frame.waitForSelector('.name-wrapper');
 await frame.waitForSelector('.submit-review');

 await page.evaluate(async({ review, maleNames, femaleNames, lastNames }) => {
  const randomMaleNameIndex = Math.floor(Math.random() * maleNames.length - 1) + 1;
  const randomFemaleNameIndex = Math.floor(Math.random() * femaleNames.length - 1) + 1;
  const randomLastNameIndex = Math.floor(Math.random() * lastNames.length - 1) + 1;

  const iframe = document.querySelector('#looxOverlay_looxDialog iframe');
    if(review.gender === 'male') {
      iframe.contentWindow.document.body.querySelector('input#first_name').value = maleNames[randomMaleNameIndex];
    } else {
      iframe.contentWindow.document.body.querySelector('input#first_name').value = femaleNames[randomFemaleNameIndex];
    }
    iframe.contentWindow.document.body.querySelector('input#last_name').value = lastNames[randomLastNameIndex];
    iframe.contentWindow.document.body.querySelector('input#email').value = 'asd@asd.com';
    iframe.contentWindow.document.body.querySelector('.submit-review').click();
  }, {maleNames, femaleNames, review, lastNames})

  const frame2 = await elementHandle.contentFrame();
  await frame2.waitFor(5000);
  try {    
  await page.evaluate(async() => {
    const iframe2 = document.querySelector('#looxOverlay_looxDialog iframe');
    iframe2.contentWindow.document.body.querySelector('.submit-review').click();
  })
  await frame2.waitFor(5000);
  await browser.close();
  } catch (err){
    await browser.close();
  }
}

async function execute(){
  const rounds = Math.ceil(reviews.reviews.length / 10);
  const iterableRounds = [...Array(rounds)].map((round, index) => index);
  console.log('Number of rounds: '+rounds)

  // for (let upindex = 0; upindex < rounds- 1; upindex++) {
  //   console.log('Round '+ upindex + 1)

  //   const test = reviews.reviews.filter((review, index) => {
  //     return index + 1 > upindex * 10 && (((index + 1)/ ((upindex + 1) *10)) <= 1)
  //   });

  //   await Promise.all(test.map(async (review, index) => {
  //     return await postReview(reviews.productPageUrl, review, index);
  //   }));
  // }
  for await (const round of iterableRounds) {
    console.log('Round '+ round + 1)
    console.log(round);

    const test = reviews.reviews.filter((review, index) => {
      return index + 1 > round * 10 && (((index + 1)/ ((round + 1) *10)) <= 1)
    });

    await Promise.all(test.map(async (review, index) => {
      return await postReview(reviews.productPageUrl, review, index);
    }));
  }
}

async function downloadImages(){
  let allCsvRows = [];

  csv.parseFile(path.resolve(__dirname, 'reviews-shoes.csv'), {headers : true})
    .on("data", function(data){
      // const dom = new jsdom.JSDOM(`<html><body>${data.body}</body></html>`);
      // const images = dom.window.document.querySelectorAll("img");
      allCsvRows = [...allCsvRows, data];
    })
    .on("end", async function(){
      await Promise.all(allCsvRows.map(async (row, index) => {
        const dom = new jsdom.JSDOM(`<html><body>${row.body}</body></html>`);
        const images = dom.window.document.querySelectorAll("img");
        const dir = `images/0${index}`;

        if (!fs.existsSync(dir)){
          fs.mkdirSync(dir);
        }
        
        await Promise.all(Array.from(images).map(async (img, imgIndex) => {
          const response = await fetch(img.src);
          const buffer = await response.buffer();
          fs.writeFileSync(`${dir}/0${imgIndex}.jpeg`, buffer, () => {});
        }))
      }))
  });
}

(async () => {
  await execute();
})()

