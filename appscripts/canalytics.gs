// This google appscript will enable pulling data from The Blue Alliance
// in order to combine it with data that is gathered through scouting.
// 
// Inspired by: https://github.com/Eiim/tba-requests 
// “Powered by The Blue Alliance” :thebluealliance.com

//Properties service holds the TBA key in a user specific property service, 
// And the Event key in a document specific property store.
var documentProperties = PropertiesService.getDocumentProperties();
var userProperties = PropertiesService.getUserProperties();
// ui allows us to send messages and get responses

// https://stackoverflow.com/questions/7033639/split-large-string-in-n-size-chunks-in-javascript
function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size)
  const chunks = new Array(numChunks)

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }

  return chunks
}

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
  eventTeams(true);
  getOPRS(true);
  eventQualMatches(true); // Likely this wont have any data for events that have not started, but try to load anyway

}

function eventTeams(ignoreCache = false ) {
  // With help from: https://stackoverflow.com/questions/64884530/populating-and-formatting-json-into-a-google-sheet
  const header = ["key","team_number","nickname","oprs","ccwms","dprs","name"] //  oprs, ccwms, dprs will be added later.

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

  jsonResult = TBAQuery('event/' + e + '/teams/simple',ignoreCache)

  const values = Object.entries(jsonResult).map(([k, v]) => {
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[1]) - Number(b[1])} ); // Position from header above.
  values.unshift(header);  // When you want to add the header, please use this.
  sheet.clear();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

}

function eventQualMatches(ignoreCache = false) {
  const initHeader = ["key","comp_level","match_number","predicted_time","actual_time","post_result_time","red1","red2","red3","red_score","blue1","blue2","blue3","blue_score"]
  var sheet = SpreadsheetApp.getActive().getSheetByName('Qualification')
  if ( sheet == null )
  {
    SpreadsheetApp.getActive().insertSheet('Qualification')
    sheet = SpreadsheetApp.getActive().getSheetByName('Qualification')
  }
  var e = getEventKey()
  if ( e === null ){
    throw new Error("Undefined Event Key")
  }

  var jsonResult = TBAQuery('event/' + e + '/matches',ignoreCache)

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
  
    scoreBreakdown(v)
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[2]) - Number(b[2])} ); // Position from header above.
  values.unshift(header);  // Add the header to the array
  sheet.clear(); // Remove any old data. Otherwise, you may have data at the end that doesnt belong.
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  
}

function qualResults() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Qualification');
  // If the sheet doesn't exist, then let's just call eventQualMatches, which will create and fill the entire sheet
  if ( sheet === null ) {
    eventQualMatches()
    return
  }
  var timeZone = Session.getScriptTimeZone();
  var data = sheet.getDataRange().getValues();
  // First row is the header
  var header = data.shift()
  Logger.log(header)
  const sbHeader = scoreBreakdownHeader()
  // Capture some important column ids 
  MATCH_KEY = header.indexOf('key')
  PREDICTED_TIME = header.indexOf('predicted_time')
  ACTUAL_TIME = header.indexOf('actual_time')
  POST_RESULT_TIME = header.indexOf('post_result_time')
  for (var i = 0; i < data.length; i++) {
    if ( data[i][POST_RESULT_TIME] === "" ){
      // Then this is a match that has not been scored.  Check with TBA to see if there is updated data.
      matchKey = data[i][MATCH_KEY]
      if ( matchKey == null ){
        //This is unexpected.  Throw an exception.  
        //TODO: If you see this exception thrown, consider just calling eventQualMatches in order to refetch all data
        throw new Error("Fail updating Qualification.  Match key was null on row:" + i)
      }else{
        // This is an update function, we shouldnt ignore cache whenupdating, just when resetting from the beginning.
        var jsonMatch = TBAQuery("match/" + matchKey , false )
        Logger.log(jsonMatch)
        data[i][PREDICTED_TIME] = new Date(jsonMatch.predicted_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        data[i][ACTUAL_TIME] = new Date(jsonMatch.actual_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        if ( jsonMatch['post_result_time'] ){
          data[i][POST_RESULT_TIME] = new Date(jsonMatch.post_result_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
          scoreBreakdown(jsonMatch) // Adds breakdown to jsnMatch
          // Looks for each item in sbHeader in jsonMatch, and copies it to data
          sbHeader.forEach(element => {data[i][header.indexOf(element)] = jsonMatch[element]})
        } else{
          // Because the matches are in order, we expect that the rest of the matches also do not have updated results and scores.
          // We are expecting the scouting team to update after each match, or after a couple of matches
          // Stopping now does not updated predicted times, but does save a number of REST calls.
          // If there is a need to update predicted times, then the entire Qual Match can be fetched from the menu.
          break;
        }
               
      }

    }
  } // End of iterating over all data in sheet
  // Must remember to replace the header!!
  data.unshift(header)
  sheet.getDataRange().setValues(data);
  getOPRS(ignoreCache)


}

function getOPRS(ignoreCache) {
  // TODO:  Get a new OPRS with timestamp everytime it changes?  So we can see the change of OPRS over time?
  // WOuld need to check the cache, I guess?
  //
  const eventKey = getEventKey()
  if ( eventKey == null ){
    throw new Error("Fail updating OPRS, Event Key was null")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName('Teams')
  if ( sheet == null )
  {
    // Something went wrong, create the sheet with a call to another routine.
    eventTeams(ignoreCache)
    sheet = SpreadsheetApp.getActive().getSheetByName('Teams')
  }
  var jsonOPR = TBAQuery("event/" + eventKey + "/oprs",ignoreCache)
  Logger.log(jsonOPR)
  if ( jsonOPR != null ){ // This could mean no OPR scores.
    var data = sheet.getDataRange().getValues();
    // First row is the header
    var header = data.shift()
    for (var i = 0; i < data.length; i++) {
      var teamKey = data[i][header.indexOf("key")]
      data[i][header.indexOf("oprs")] = jsonOPR.oprs[teamKey]
      data[i][header.indexOf("ccwms")] = jsonOPR.ccwms[teamKey]
      data[i][header.indexOf('dprs')] = jsonOPR.dprs[teamKey]
    }
    data.unshift(header)
    sheet.getDataRange().setValues(data);
  } // end of null jsonOPR
}

function eventFinalMatches() {
  // TODO: This is duplicating the work done in eventQualMatches.  Should try to refactor to not duplicate code
  // 
}

// To get a scoreBreakdown to show up in the spreadsheet, both a header needs to be added, and
// the value needs to be calcualted in the scoreBreakdown function
function scoreBreakdownHeader(){
  // return year specific score breakdown header
  return ["red1_taxi","red2_taxi","red3_taxi",
    "red1_endgame","red2_endgame","red3_endgame",
    "blue1_taxi","blue2_taxi","blue3_taxi",
    "blue1_endgame","blue2_endgame","blue3_endgame"]    
}
function scoreBreakdown(match){
  // Breakdown year specific score information.  Set up for 2022 season
  var sbd=match.score_breakdown
  match.red1_taxi = sbd.red.taxiRobot1
  match.red2_taxi = sbd.red.taxiRobot2
  match.red3_taxi = sbd.red.taxiRobot3
  match.blue1_taxi = sbd.blue.taxiRobot1
  match.blue2_taxi = sbd.blue.taxiRobot2
  match.blue3_taxi = sbd.blue.taxiRobot3
  match.red1_endgame = sbd.red.endgameRobot1
  match.red2_endgame = sbd.red.endgameRobot2
  match.red3_endgame = sbd.red.endgameRobot3
  match.blue1_endgame = sbd.blue.endgameRobot1
  match.blue2_endgame = sbd.blue.endgameRobot2
  match.blue3_endgame = sbd.blue.endgameRobot3

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
function TBAQuery(path, ignoreCache) {
  var url = 'https://www.thebluealliance.com/api/v3/'+path
  const cacheDocument = CacheService.getDocumentCache();
  var headers = {}
  
  if ( getAPIKey_() === null ){
    throw new Error("No API Key, set key before running any other scripts.");
  }else{
    headers['X-TBA-Auth-Key'] = getAPIKey_()
  }
  
  if ( ignoreCache ){
    Logger.log("Ignoring cache for " + path )
    var cacheStats = null
    var cacheResult = null
  }else{
    try{
      var cacheStats = JSON.parse(cacheDocument.get("cacheStats:" + url ))
      var tempResult = ""
      Logger.log(cacheStats)
      for ( let i = 0; i< cacheStats.numChunks; i++){
        var tempCache = cacheDocument.get("chunk:" + i + ":" + url)
        if ( tempCache == null ){
          throw new Error("Some missing pieces of cache chunks") 
        }
        tempResult = tempResult.concat(tempCache)
      }
      Logger.log("Cache get length: " + tempResult.length)
      var cacheResult = JSON.parse(tempResult)
    }catch(err) {
      var cacheStats = null
      var cacheResult = null
      Logger.log(err.message)
    }
  }
  if ( cacheStats != null && cacheResult != null ){
    // Data is cached.  Let's check to see if it is still good
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
    'headers' : headers,
    'muteHttpExceptions' : true
  }

  var result = UrlFetchApp.fetch(url, params);
  Logger.log("TBA response code:" + result.getResponseCode())
  if ( result.getResponseCode() === 304 ){
    // Even though the data is past the cache timeout, TBA has confirmed that nothing has changed.
    // Return the stale cache.
    Logger.log(result.getHeaders())
    Logger.log("nothing changed returned from tba, returning stale cache")
    return cacheResult
  }else if ( result.getResponseCode() != 200 ){
    throw new Error("Failed TBA call.  URL: " + url + " Response code: " + result.getResponseCode() )
  }
  
  // Good return status, cache locally cache stats and data.
  const resultHeaders = result.getHeaders()
  var maxAge = resultHeaders["Cache-Control"].match(/max-age=(\d+)/)[1]
  
  var jsonResult = JSON.parse(result.getContentText());
  var cacheStats = {}

  cacheStats['cacheExpireMs'] = new Date().getTime() + maxAge*1000,
  cacheStats['etag'] = resultHeaders['ETag']
  
  // A full event takes ~150k for all of the qualifications and finals.
  // Need to optionally chunk up the result into less than 100KB chunks
  chunks = chunkSubstr(JSON.stringify(jsonResult),100000)
  for (let i = 0; i < chunks.length; i++) {
    cacheDocument.put("chunk:" + i + ":" + url,chunks[i])
  }
  // There is not a guarantee that all chunks will remain in cache, so make sure to 
  // Save the number of chunks in our stats object.
  cacheStats['numChunks'] = chunks.length

  cacheDocument.put("cacheStats:" + url, JSON.stringify(cacheStats), 21600)

  return jsonResult
}


