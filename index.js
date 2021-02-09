const { Builder, By, Capabilities, Key, until } = require('selenium-webdriver')
const logger = require('log4js').getLogger()
const Moment = require('moment')
const { createObjectCsvWriter } = require('csv-writer')

const capabilities = Capabilities.chrome()
capabilities.set('chromeOptions', {
  args: [
    // '--headless', // ブラウザの動きを見え化するためコメントアウト
    '--disable-gpu',
    '--window-size=1024,768'
  ],
  w3c: false
})

logger.level = process.env.LOG_LEVEL || 'ERROR'
const TODAYHYPHEN = Moment().format('DD-MM-YYYY')
const TODAYSLASH = Moment().format('DD/MM/YYYY')
const CHANNEL = process.env.CHANNEL
const START_LINK = process.env.START_LINK
const WAIT_TIMEOUT = process.env.WAIT_TIMEOUT
const OUTPUT_FILENAME = `${CHANNEL}-${TODAYHYPHEN}.csv`

// depend on what data you need
const CSV_HEADER = [
  {id: 'date', title: 'Date'},
  {id: 'channel', title: 'Channel'},
  {id: 'url', title: 'Url'},
  {id: 'name', title: 'Name'},
  {id: 'price', title: 'Price(THB)'},
  {id: 'unit_price', title: 'Unit Price(THB)'},
  {id: 'image_url', title: 'Image Url'},
]

const scrapeToCsv = async () => {
  let driver = await new Builder()
    .withCapabilities(capabilities)
    .build()

  try {
    console.log(`Writing ${CHANNEL} items data to ${OUTPUT_FILENAME}`)

    const csvHeaderIds = CSV_HEADER.map(item => {
      return item.id
    })
    const csvWriter = createObjectCsvWriter({
      path: OUTPUT_FILENAME,
      header: CSV_HEADER
    })
    
    await driver.manage().window().maximize()
    await driver.get(START_LINK)

    const paginations = await getPaginations(driver)

    let csvRows = []
    await extractProductDataToCsv(driver, csvHeaderIds, csvRows, START_LINK, paginations)

    csvWriter
      .writeRecords(csvRows)
      .then(() => {console.log(`Total ${csvRows.length} records`)})
  } catch (e) {
    console.log(e)
    logger.error(e)
  } finally {
    await driver.quit()
  }
}

const getPaginations = async (driver) => {
  const paginations = await (await driver.findElement(By.className('pages-items'))).findElements(By.className('item'))
  paginations.shift()
  paginations.pop()

  return paginations
}

const goToNextPage = async (driver, paginationElements, pageNum) => {
  await driver.executeScript('return arguments[0].click()', await (await paginationElements[pageNum - 1]).findElement(By.className('page')))
}

const extractProductDataToCsv = async (driver, csvHeaderIds, csvRows, url, paginationElements, currentPage = 1) => {
  const WAIT_LOADING = 3000
  const SCROLL_HEIGHTS = 200000
  // classNameで取れない場合はxpath
  const productTopClassName = ''
  const productListClassName = ''
  const productNameClassName = ''
  const productPriceClassName = ''
  const productUnitPriceClassName = ''
  const productImageClassName = ''

  let productTop = await driver.wait(until.elementLocated(By.className(productTopClassName)), WAIT_TIMEOUT)

  // 画像などlazy-load対策
  await driver.sleep(WAIT_LOADING)
  await driver.executeScript(`window.scrollBy({top: ${SCROLL_HEIGHTS}, left: 0, behavior: 'smooth'})`)
  await driver.sleep(WAIT_LOADING)

  productTop = await driver.wait(until.elementLocated(By.className(productTopClassName)), WAIT_TIMEOUT)

  const productDataList = await productTop.findElements(By.className(productListClassName))

  for (let [index, productData] of productDataList.entries()) {
    const productName = await productData.findElement(By.className(productNameClassName)).getText()
    
    const productPrice = await productData.findElement(By.className(productPriceClassName))

    const productUnitPrice = await productData.findElement(By.className(productUnitPriceClassName))

    const productImage = await productData.findElement(By.className(productImageClassName))

    const productImageSrc = await productImage.getAttribute('src')

    let csvRow = csvHeaderIds.reduce((o, headerId) => ({ ...o, [headerId]: '' }, {}))

    csvRow.date = TODAYSLASH
    csvRow.channel = CHANNEL 
    csvRow.url = url
    csvRow.name = productName
    csvRow.price = productPrice
    csvRow.unit_price = productUnitPrice 
    csvRow.image_url = productImageSrc

    csvRows.push(csvRow)  
  }
    
  if (paginationElements.length !== currentPage) {
    const nextPage = currentPage += 1    
    await goToNextPage(driver, paginationElements, nextPage)

    await extractProductDataToCsv(driver, csvHeaderIds, csvRows, url, paginationElements, nextPage)
  }
}

(async () => {
  const startTimestamp = Date.now() // 実行時間用

  await scrapeToCsv()

  const endTimestamp = Date.now()
  const diffTime = Math.abs(endTimestamp - startTimestamp)
  console.log(`Took ${Math.floor((diffTime/1000)/60)} mins`)
})()
