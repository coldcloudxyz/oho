/**
 * आज का संदेश — Google Sheets logger
 *
 * Deploy this Apps Script as a Web app:
 * Execute as: Me
 * Who has access: Anyone
 * Copy the /exec URL into GOOGLE_SHEETS_WEBHOOK_URL.
 */
const SHEET_NAME = "Payments";

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",
      "Name",
      "Feeling",
      "Razorpay Order ID",
      "Razorpay Payment ID",
      "Amount",
      "Currency",
      "Status",
      "Gateway"
    ]);
    sheet.setFrozenRows(1);
  }
}

function doPost(e) {
  setup();
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(data.timestamp || new Date()),
      data.name || "",
      data.feeling || "",
      data.order_id || "",
      data.payment_id || "",
      data.amount || 0,
      data.currency || "INR",
      data.status || "paid",
      data.gateway || "Razorpay"
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("Aaj Ka Sandesh Sheets webhook is live.").setMimeType(ContentService.MimeType.TEXT);
}
