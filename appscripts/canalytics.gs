// This google appscript will enable pulling data from The Blue Alliance
// in order to combine it with data that is gathered through scouting.
// 
// Inspired by: https://github.com/Eiim/tba-requests 

//Properties service holds the TBA key in a user specific property service, 
// And the Event key in a document specific property store.
var documentProperties = PropertiesService.getDocumentProperties();
var userProperties = PropertiesService.getUserProperties();
// ui allows us to send messages and get responses


function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('ausTIN CANalytics')
      .addItem('TBA API Key','readAPIKey')
      .addItem('Event Key and Initialize', 'initEvent' )
      .addItem('Set Team Key','readTeamKey')
      .addItem('Reset API Key','resetAPIKey')
      .addSeparator()
      .addItem('Init Teams List','eventTeams')
      .addItem('Init Qual. Matches','eventQualMatches')
      .addItem('Update Match Results','qualResults')
      .addItem('Load Finals Matches','eventFinalMatches')
      .addToUi();
}

function readAPIKey() {
  // Can only be called from a menu
  const ui = SpreadsheetApp.getUi();
  var scriptValue = ui.prompt('Please provide your TBA API key.' , ui.ButtonSet.OK);
  userProperties.setProperty('TBA_API_KEY', scriptValue.getResponseText());
}

// This is a private function, and will not run in a cell.
function getAPIKey_() {
  var key = userProperties.getProperty('TBA_API_KEY')
  if (key) {return key} else { return null }
}

function readTeamKey() {
  // Can only be called from a menu
  const ui = SpreadsheetApp.getUi();
  var scriptValue = ui.prompt('Please provide your Team key. ( only numeric part )' , ui.ButtonSet.OK);
  userProperties.setProperty('TEAM_KEY', scriptValue.getResponseText());
}

// This is a private function, and will not run in a cell.
function getTeamKey() {
  var key = userProperties.getProperty('TEAM_KEY')
  if (key) {return key} else { return null }
}

function resetAPIKey(){
  userProperties.deleteProperty('TBA_API_KEY')
}

function readEventKey() {
  // Can only be called from a menu
  const ui = SpreadsheetApp.getUi();
  var scriptValue = ui.prompt('Please provide event key.' , ui.ButtonSet.OK);
  documentProperties.setProperty('EVENT_KEY', scriptValue.getResponseText());
}

function getEventKey() {
    var key = documentProperties.getProperty('EVENT_KEY')
    if (key) {return key} else { return null }
}

function initEvent() {
  readEventKey();
  eventTeams();
  eventQualMatches(); // Likely this wont have any data for events that have not started, but try to load anyway

}

function eventTeams() {
  // With help from: https://stackoverflow.com/questions/64884530/populating-and-formatting-json-into-a-google-sheet
  const header = ["key","team_number","nickname","name"]

  var sheet = SpreadsheetApp.getActive().getSheetByName('Teams')
  if( sheet == null)
  {
  //if returned null means the sheet doesnt exist, so create it
  SpreadsheetApp.getActive().insertSheet('Teams')
  sheet = SpreadsheetApp.getActive().getSheetByName('Teams')
  }
  var e = getEventKey()
  if ( e === null ){
    throw new Error("Undefined Event Key")
  }

  jsonResult = TBAQuery('/event/' + e + '/teams/simple')

  const values = Object.entries(jsonResult).map(([k, v]) => {
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[1]) - Number(b[1])} ); // Position from header above.
  values.unshift(header);  // When you want to add the header, please use this.
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  
  
}

function eventQualMatches() {
  // TODO: Be sensible about score breakdown
  // https://stackoverflow.com/questions/69566912/how-do-i-extract-data-from-certain-columns-in-appscript might have something to add names to columns?
  const initHeader = ["key","comp_level","match_number","predicted_time","actual_time","post_result_time","red1","red2","red3","red_score","blue1","blue2","blue3","blue_score"]
  var sheet = SpreadsheetApp.getActive().getSheetByName('Qualification')
  var e = getEventKey()
  if ( e === null ){
    throw new Error("Undefined Event Key")
  }

  var jsonResult = TBAQuery('/event/' + e + '/matches')

  var timeZone = Session.getScriptTimeZone();
  var header = initHeader.concat(scoreBreakdownHeader());
  const values = Object.entries(jsonResult).filter(([k, v]) => { return v.comp_level === "qm"}).map(([k, v]) => {
    v.red1 = v.alliances.red.team_keys[0];
    v.red2 = v.alliances.red.team_keys[1];
    v.red3 = v.alliances.red.team_keys[2];
    v.red_score = v.alliances.red.score;
    v.blue1 = v.alliances.red.team_keys[0];
    v.blue2 = v.alliances.red.team_keys[1];
    v.blue3 = v.alliances.red.team_keys[2];
    v.blue_score = v.alliances.blue.score;
    v.predicted_time = new Date(v.predicted_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
    v.actual_time = new Date(v.actual_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
    v.post_result_time = new Date(v.post_result_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
    
    Logger.log(v.score_breakdown);
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[2]) - Number(b[2])} ); // Position from header above.
  values.unshift(header);  // Add the header to the array
  sheet.clear(); // Remove any old data. Otherwise, you may have data at the end that doesnt belong.
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  
}

function qualResults() {
  SpreadsheetApp.getUi() 
     .alert('qualResults is not written yet');
  // TODO: Update OPRs on teams page.
  // TODO: Update scores for each match that doesnt have a score time.
  // Shift and indexof to read spreadsheet stuff.
}

function eventFinalMatches() {
  // TODO: We pull the same list of events, and filter out all QM, and then duplicate processing.  
  // This is not ideal. Think how to do this better. Like, write both pages at the same time?  
  // 
}

function scoreBreakdownHeader(){
  // return year specific score breakdown header
  return ["red1_taxi","red2_taxi","red3_taxi",
    "red1_endgame","red2_endgame","red3_endgame",
    "blue1_taxi","blue2_taxi","blue3_taxi",
    "blue1_endgame","blue2_endgame","blue3_endgame"]    
}
function scoreBreakdown(sbd){
  // Breakdown year specific score information
  //TODO: Figure out if there are shallow copies of objects, or not.  Can I just add stuff to v?  that would be good.
  // Can I save the current JSON for the matches?  ANd only write them to the sheet after modification?
  sbd.red1_taxi=0;
}
/**
 * Handles the HTTPS request for TBA requests. Takes the path, such as team/frc1234/simple, and returns the resulting JSON object. 
 * Notes about caching:
 *   We cache every response with a key of the url
 *   We save the current time + max-age from the Cache-Control header of the response in the Document Cache Service as well as the ETag
 *   When we check again, if the time that has elapsed is less than the max-age, then we will return the cached data.
 *   If the cache is no longer valid, we will check with The Blue Alliance, with the Etag from the last response.
 *   ( reference: https://www.thebluealliance.com/apidocs look for Caching )
 *   If the response code is 304, then the data has not changed, and the Cache is still valid even though the time has passed.
 *   Since the data can be valid past the max-age, we lie to the cache-control and ask it to save data for 6 hours.
 * 
 * @param {text} path The part of the URL after "/api/v3/" in the query.
 * @return Parsed json of the result including a cache time and Etag used for reducing data transfer.
 * @customfunction
 */
function TBAQuery(path) {
  var url = 'https://www.thebluealliance.com/api/v3/'+path
  const cacheDocument = CacheService.getDocumentCache();
  var headers = {}
  
  if ( getAPIKey_() === null ){
    throw new Error("No API Key, set key before running any other scripts.");
  }else{
    headers['X-TBA-Auth-Key'] = getAPIKey_()
  }
  
  var cacheStats = JSON.parse(cacheDocument.get("cacheStats" + url ))
  var cacheResult = cacheDocument.get(url)

  if ( cacheStats != null && cacheResult != null ){
    // Data is cached.  Lets check to see if it is still good
    // Cache Service can decide to arbitrarily remove cache entries, so check both.
    var now = new Date().getTime();
    Logger.log("url: " + url + " cacheExpireMs: " + cacheStats.cacheExpireMs + " ETag: " + cacheStats.etag + "date: " + now )
    if ( cacheStats.cacheExpireMs > now ){
      Logger.log("Within max age, returning cache")
      return cacheResult;
    }else{
       headers['If-None-Match'] = cacheStats.etag
    }
  }
  // headers['If-None-Match'] = "900cc8acb24b1c43ba74d061345260c317dcd610" for https://www.thebluealliance.com/api/v3//event/2023txhou/teams/simple

  var params = {
    'headers' : headers
  }

  var result = UrlFetchApp.fetch(url, params);
  Logger.log("TBA response code:" + result.getResponseCode())
  if ( result.getResponseCode() == 304 ){
    // Even though the data is past the cache timeout, TBA has confirmed that nothing has changed.
    // Return the stale cache.
    Logger.log("nothing changed returned from tba, returning stale cache")
    return cacheResult
  }else if ( result.getResponseCode() != 200 ){
    throw new Error("Failed TBA call.  URL: " + url + " Response code: " + result.getResponseCode() )
  }
  const resultHeaders = result.getHeaders()
  var maxAge = resultHeaders["Cache-Control"].match(/max-age=(\d+)/)[1]
  
  var jsonResult = JSON.parse(result.getContentText());
  var cacheStats = {}

  cacheStats['cacheExpireMs'] = new Date().getTime() + maxAge*1000,
  cacheStats['etag'] = resultHeaders['ETag']
  
  cacheDocument.put("cacheStats" + url, JSON.stringify(cacheStats), 21600)
  cacheDocument.put(url, jsonResult, 21600)

  return jsonResult
}

