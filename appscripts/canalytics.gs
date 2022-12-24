/**
 * 
 * This google appscript will enable pulling data from The Blue Alliance
 * in order to combine it with data that is gathered through scouting.
 *  Inspired by: https://github.com/Eiim/tba-requests 
 * 
 * “Powered by The Blue Alliance” :thebluealliance.com
 * 
 * Design notes:
 *   All REST API results are cached.
 *   The scripts are designed that all data will be fetched using menu items, avoiding surprising Network calls.
 *   If any calls fail, errors will be thrown, leaving the data still in the sheet.
 */

// TODO: Freeze first row in each sheet
// TODO: Auto resize columns
// TODO: Standardize names for matchValues, matchData, etc.
// TODO: combineData(); and loadTeamDetails.  Where should they go?

/** 
 * The following are general purpose routines and constants 
 * 
*/

//Properties service holds the TBA key in a user specific property service, 
// And the Event key in a document specific property store.
var documentProperties = PropertiesService.getDocumentProperties();

const Match = {
  QUALIFICATIONS: 1,
  FINALS: 2
}

// Create an object that maps property names to strings to catch any typos as 
// "Key" errors at runtime instead of quiet errors
const Prop = {
  TBA_API_KEY: "TBA_API_KEY",
  TEAM_KEY: "TEAM_KEY",
  EVENT_KEY: "EVENT_KEY",
  TEAM_DETAILS_HEADER: "TEAM_DETAILS_HEADER"
}

const Sheet = {
  TEAMS : "Team Details ( TBA )",
  QUALIFICATIONS : "Qualifications",
  FINALS : 'Finals',
  SCOUTING : 'Scouting',
  TEAM_SUMMARY : "Combined Team Summary"
}

// https://stackoverflow.com/questions/7033639/split-large-string-in-n-size-chunks-in-javascript
function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size)
  const chunks = new Array(numChunks)

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }
  return chunks
}

/**
 * Manage menu creation, reading and getting api keys and other configuration items
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('ausTIN CANalytics')
      .addItem('TBA API Key','readAPIKey')
      .addItem('Event Key and Initialize', 'initEvent' )
      .addItem('Reset API Key','resetAPIKey')
      .addSeparator()
      .addItem('Load Teams List','loadEventTeams')
      .addItem('Load Qual. Matches','loadQualMatches')
      .addItem('Update Qual. Results','updateQualResults')
      .addItem('Load Finals Matches','loadFinalMatches')
      .addToUi();
}

function readAPIKey() {
  // Can only be called from a menu
  const ui = SpreadsheetApp.getUi();
  var scriptValue = ui.prompt('Please provide your TBA API key.' , ui.ButtonSet.OK);
  documentProperties.setProperty('TBA_API_KEY', scriptValue.getResponseText());
}

// This is a private function, and will not run in a cell.
function getAPIKey_() {
  var key = documentProperties.getProperty(Prop.TBA_API_KEY)
  if (key) {return key} else { return null }
}

// This should never need to be used.
// Including it in case someone wants to ensure their API KEY is entirely removed.
function resetAPIKey(){
  documentProperties.deleteProperty(Prop.TBA_API_KEY)
}

function readEventKey() {
  // Can only be called from a menu
  const ui = SpreadsheetApp.getUi();
  var scriptValue = ui.prompt('Please provide event key.' , ui.ButtonSet.OK);
  documentProperties.setProperty(Prop.EVENT_KEY, scriptValue.getResponseText());
}

function getEventKey() {
    var key = documentProperties.getProperty(Prop.EVENT_KEY)
    if (key) {return key} else { return null }
}

/** 
 * Year specific functions.  
 * These functions need to be updated every year to include updates to how scoring is recorded every year.
 * 
 * This also includes match scouting and any routines to combine data into a summary.
 */

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

function scoreBreakdownSummaryHeader(){
  return ["taxi_success","highest_climb"]
}

function scoreBreakdownSummary(matchValues,summaryData){
  /**
   * matchValues contains the entire sheet from Qualification reorganized
   * as an Object instead of an array.  The key is the match key.
   * 
   * summaryData is the array of data that we are 
   * TODO:  These names could be finetuned.  Make sure data always equals array, or something.
   */
  Object.keys(summaryData).forEach( k => {
      summaryData[k]['taxi']=0;
      summaryData[k]['highest_climb']=0;
      summaryData[k]['total_climb_score']=0;
   })
   Object.keys(matchValues).forEach( k => {
     if ( matchValues[k]['post_result_time'] != ""){
       if ( matchValues[k]['red1_taxi'] == "Yes" ){ summaryData[matchValues[k]['red1']]['taxi'] +=1 }
       if ( matchValues[k]['red2_taxi'] == "Yes" ){ summaryData[matchValues[k]['red2']]['taxi'] +=1 }
       if ( matchValues[k]['red3_taxi'] == "Yes" ){ summaryData[matchValues[k]['red3']]['taxi'] +=1 }
       if ( matchValues[k]['blue1_taxi'] == "Yes" ){ summaryData[matchValues[k]['blue1']]['taxi'] +=1 }
       if ( matchValues[k]['blue2_taxi'] == "Yes" ){ summaryData[matchValues[k]['blue2']]['taxi'] +=1 }
       if ( matchValues[k]['blue3_taxi'] == "Yes" ){ summaryData[matchValues[k]['blue3']]['taxi'] +=1 }
     }
   })
   Object.keys(summaryData).forEach( k => { summaryData[k]['taxi_success'] = summaryData[k]['taxi'] + "/" + summaryData[k]['matches_played'] + " success"} )
}

function scoutingSummaryHeader(){
  return []
}

function scoutingSummary(summary){
  // Read in scouting sheet, 
  // do calculations on it to return a summary.
  return summary
}

/** 
 * Functions to create charts and summary tables of information
 * 
 */

function getNextMatch(teamKey){
  if ( teamKey == null ){
    throw new Error("No team key set, or as parameter")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  if ( sheet == null )
  {
    loadQualMatches(false)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  }  
  var data = sheet.getDataRange().getValues();
  // First row is the header
  var header = data.shift()
  const Index =  {
    MATCH_KEY : header.indexOf('key'),
    ACTUAL_TIME : header.indexOf('actual_time')
  }
  var nextMatchKey = null
  for (var i = 0; i < data.length; i++) {
    if ( data[i][Index.ACTUAL_TIME] === "" ){
      // This match has not occurred yet, check and see if the team is in the match.
      if ( data[i].join().match(teamKey) != null ){
        // Save the match key, and exit the loop
        nextMatchKey = data[i][Index.MATCH_KEY]
        break
      }
    }
  } // end of for data
  return nextMatchKey
}

function getRedAlliance(matchKey){
  /** Leaving these here.  However, a query is much much quicker in the sheet.
   * 
   * =query(Qualifications!$2:$1000,"select H where A='"&D1&"'")
   * Only downside is that anytime the columns change, the query breaks.
   * 
   */

  if ( matchKey == null ){
    throw new Error("No match key as parameter for getRedAlliance")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  if ( sheet == null )
  {
    throw new Error ( "Qual Sheet is missing in getRedAlliance")
  } 
  var data = sheet.getDataRange().getValues()
  var header = data.shift()
  matchRow = data.filter(r => r[header.indexOf('key')] == matchKey)
  if ( matchRow.length != 1 ){
    throw new Error("Not the right number of rows for a match in redAlliance")
  }
  return [matchRow[0][header.indexOf('red1')],matchRow[0][header.indexOf('red2')],matchRow[0][header.indexOf('red3')]]
}

function getBlueAlliance(matchKey){
  /** Leaving these here.  However, a query is much much quicker in the sheet.
   * 
   * =query(Qualifications!$2:$1000,"select H where A='"&D1&"'")
   * 
   * 
   */
  if ( matchKey == null ){
    throw new Error("No match key as parameter for getBlueAlliance")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  if ( sheet == null )
  {
    throw new Error ( "Qual Sheet is missing in getBlueAlliance")
  } 
  var data = sheet.getDataRange().getValues()
  var header = data.shift()
  matchRow = data.filter(r => r[header.indexOf('key')] == matchKey)
  if ( matchRow.length != 1 ){
    throw new Error("Not the right number of rows for a match in getBlueAlliance")
  }
  return [matchRow[0][header.indexOf('blue1')],matchRow[0][header.indexOf('blue2')],matchRow[0][header.indexOf('blue3')]]
}

function combineData(){
  // Combine all TBA, Scoring breakdown, and Scouting data into one large sheet by team.
  // This sheet can then be used as a source for vlookups and query's for results
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAM_SUMMARY)
  if ( sheet == null )
  {
    SpreadsheetApp.getActive().insertSheet(Sheet.TEAM_SUMMARY)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAM_SUMMARY)
  }  
  var header = ["team_number"]
  const tdHeader = teamDetailsHeader()
  header = header.concat(tdHeader)
  header = header.concat(scoreBreakdownSummaryHeader())
  header = header.concat(scoutingSummaryHeader())

  var teamSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  var teamData = teamSheet.getDataRange().getValues();
  // First row is the header
  var teamHeader = teamData.shift()
  // Translate the data into an object.  Easier to append information
  const TeamIndex =  {
    TEAM_NUMBER : teamHeader.indexOf('team_number'),
    NICKNAME : teamHeader.indexOf('nickname'),
  }
  
  var data = {} 
  for (var i = 0; i < teamData.length; i++) {
    data[teamData[i][TeamIndex.TEAM_NUMBER]] = {}
    data[teamData[i][TeamIndex.TEAM_NUMBER]]['nickname']=teamData[i][TeamIndex.NICKNAME]
    tdHeader.forEach(element => {data[teamData[i][TeamIndex.TEAM_NUMBER]][element] = teamData[i][teamHeader.indexOf(element)] })
  }
  var matchSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  var matchData = matchSheet.getDataRange().getValues()
  var matchHeader = matchData.shift()
  var matchValues = {}
  matchData.forEach(r => { 
    const localKey = r[matchHeader.indexOf('key')]
    matchValues[localKey] = {};
    matchHeader.forEach( h => matchValues[localKey][h]=r[matchHeader.indexOf(h)] )
  })  
  scoreBreakdownSummary(matchValues,data)
  // TODO: scouting summary function call.
  const values = Object.entries(data).map(([k, v]) => {
    v["team_number"]=k;
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[0]) - Number(b[0])} ); // Position from header above.
  values.unshift(header);  // Add the header back to the data at the first row
  sheet.clear();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}

/**
 *  Function to gather external information from TBA through REST API
 * 
 *  precondition: a TBA API KEY from thebluealliance.com stored in document properties
 *  parameters: 
 *     path: an API path from:  https://www.thebluealliance.com/apidocs starting after api/v3/ _not_ starting with a path separator
 * 
 *     ignoreCache: a boolean to determine if we use ETag and max-age caching when returning results.
 *  returns: JSON object from the API, exception if there are errors.
 *  
 */

function tbaQuery(path, ignoreCache=false) {
  const url = 'https://www.thebluealliance.com/api/v3/'+path
  const cacheDocument = CacheService.getDocumentCache();
  var cacheStats // Information about cached data including ETag
  var cacheResult // reassembled cached data in JSON format
  var headers = {} // HTTP headers, including API key

  if ( getAPIKey_() === null ){
    throw new Error("No API Key, set key before running any other scripts.");
  }else{
    headers['X-TBA-Auth-Key'] = getAPIKey_()
  }
  
  if ( ignoreCache ){
    Logger.log("Ignoring cache for " + path )
    cacheStats = null
    cacheResult = null
  }else{
    try{
      cacheStats = JSON.parse(cacheDocument.get("cacheStats:" + url ))
      if ( cacheStats != null ){
        var tempResult = ""
        for ( let i = 0; i< cacheStats.numChunks; i++){
          var tempCache = cacheDocument.get("chunk:" + i + ":" + url)
          if ( tempCache == null ){
            throw new Error("Some missing pieces of cache chunks") 
          }
          tempResult = tempResult.concat(tempCache)
        }
        cacheResult = JSON.parse(tempResult)
      } else {
        cacheResult = null
      }
      
    }catch(err) {
      // Any errors in any part of the cache retrieval means we should get uncached results.
      cacheStats = null
      cacheResult = null
      Logger.log(err.message)
    }
  }

  // Cache Service can decide to arbitrarily remove cache entries, so check both.
  if ( cacheStats != null && cacheResult != null ){
    // Data is cached.  Let's check to see if it is still good
    var now = new Date().getTime();
    Logger.log("url: " + url + " cacheExpireMs: " + cacheStats.cacheExpireMs + " ETag: " + cacheStats.ETag + "date: " + now )
    if ( cacheStats.cacheExpireMs > now ){
      // This is within the time for the cache directive.  
      Logger.log("Within max age, returning cache")
      return cacheResult;
    }else{
      // The data might still have not changed, ask TBA to check out ETag for this specific path
      headers['If-None-Match'] = cacheStats.ETag
    }
  }

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
    Logger.log("nothing changed returned from tba, returning stale cache for path: " + url)
    return cacheResult
  }else if ( result.getResponseCode() != 200 ){
    throw new Error("Failed TBA call.  URL: " + url + " Response code: " + result.getResponseCode() )
  }
  // Good return status, cache locally cache stats and data.
  var resultHeaders = result.getHeaders()
  var maxAge = resultHeaders["Cache-Control"].match(/max-age=(\d+)/)[1]
  var jsonResult = JSON.parse(result.getContentText());
  var cacheStats = {}

  cacheStats['cacheExpireMs'] = new Date().getTime() + maxAge*1000,
  cacheStats['ETag'] = resultHeaders['ETag']
  
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
  Logger.log(jsonResult)
  return jsonResult
}

/**
 * Data gathering functions.
 */

function initEvent() {
  // Not only should this be used to initialize the sheets when examining a new event.
  // It can also be used to ignore and rest the cache for all sheets.
  readEventKey();
  loadEventTeams(true);
  loadTeamDetails(true);
  loadQualMatches(true); 
  loadFinalMatches(false); //loadQualMatches has just fetched a new cache.
  combineData();
}

function loadEventTeams(ignoreCache = false ) {
  // With help from: https://stackoverflow.com/questions/64884530/populating-and-formatting-json-into-a-google-sheet
  var header = ["key","team_number","nickname"] //  
  header = header.concat(teamDetailsHeader(ignoreCache))
  header = header.concat(['name']) // Name is obnoxiously long, keep it at the end of the sheet.
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  if( sheet == null)
  {
  //if returned null means the sheet doesnt exist, so create it
  SpreadsheetApp.getActive().insertSheet(Sheet.TEAMS)
  sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  }
  var eventKey = getEventKey()
  if ( eventKey === null ){
    throw new Error("Undefined Event Key")
  }

  jsonResult = tbaQuery('event/' + eventKey + '/teams/simple',ignoreCache)

  const values = Object.entries(jsonResult).map(([k, v]) => {
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[1]) - Number(b[1])} ); // Position from header above.
  values.unshift(header);  // Add the header back to the data at the first row
  sheet.clear();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  loadTeamDetails(ignoreCache)
}

function loadQualMatches(ignoreCache = false){
  loadMatches_(ignoreCache,Match.QUALIFICATIONS)
  combineData()
}

function loadFinalMatches(ignoreCache = false) {
  loadMatches_(ignoreCache,Match.FINALS)
}

function loadMatches_(ignoreCache = false,matchType) {
  const initHeader = ["key","comp_level","match_number","predicted_time","sortable_predicted_time","actual_time","post_result_time","red1","red2","red3","blue1","blue2","blue3","red_score","blue_score"]
  var sheetName
  if ( matchType == Match.QUALIFICATIONS ){
    sheetName = Sheet.QUALIFICATIONS
  }else if ( matchType == Match.FINALS){
    sheetName = Sheet.FINALS
  }else{
    throw new Error("Internal error: matchType not set in loadMatches")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName)
  if ( sheet == null )
  {
    SpreadsheetApp.getActive().insertSheet(sheetName)
    sheet = SpreadsheetApp.getActive().getSheetByName(sheetName)
  }
  var e = getEventKey()
  if ( e === null ){
    throw new Error("Undefined Event Key")
  }
  var jsonResult = tbaQuery('event/' + e + '/matches',ignoreCache)
  var timeZone = Session.getScriptTimeZone();
  var header = initHeader.concat(scoreBreakdownHeader());
  const values = Object.entries(jsonResult).filter(([k, v]) => { return matchType == Match.QUALIFICATIONS ? v.comp_level === "qm" : v.comp_level != "qm" }).map(([k, v]) => {
    v.red1 = v.alliances.red.team_keys[0].replace(/^frc/, '');
    v.red2 = v.alliances.red.team_keys[1].replace(/^frc/, '');
    v.red3 = v.alliances.red.team_keys[2].replace(/^frc/, '');
    v.red_score = v.alliances.red.score;
    v.blue1 = v.alliances.blue.team_keys[0].replace(/^frc/, '');
    v.blue2 = v.alliances.blue.team_keys[1].replace(/^frc/, '');
    v.blue3 = v.alliances.blue.team_keys[2].replace(/^frc/, '');
    v.blue_score = v.alliances.blue.score;
    v.sortable_predicted_time = v.predicted_time;
    v.predicted_time = new Date(v.predicted_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
    v.actual_time = new Date(v.actual_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
    v.post_result_time = new Date(v.post_result_time*1000).toLocaleString('en-US', {timeZone: timeZone} );
  
    scoreBreakdown(v)
    return header.map(h => v[h]);
  });
  values.sort((a, b) => { return Number(a[4]) - Number(b[4])} ); // Position from header above.
  values.unshift(header);  // Add the header to the array
  sheet.clear(); // Remove any old data. Otherwise, you may have data at the end that doesnt belong.
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);  
}

function updateQualResults() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS);
  // If the sheet doesn't exist, then let's just call loadQualMatches, which will create and fill the entire sheet
  if ( sheet === null ) {
    loadQualMatches()
    loadTeamDetails()
    combineData()
    return
  }
  const timeZone = Session.getScriptTimeZone();
  var data = sheet.getDataRange().getValues();
  // First row is the header
  var header = data.shift()
  const sbHeader = scoreBreakdownHeader()
  // Capture some important column ids 
  const Index =  {
    MATCH_KEY : header.indexOf('key'),
    PREDICTED_TIME : header.indexOf('predicted_time'),
    ACTUAL_TIME : header.indexOf('actual_time'),
    POST_RESULT_TIME : header.indexOf('post_result_time')
  }
  for (var i = 0; i < data.length; i++) {
    if ( data[i][Index.POST_RESULT_TIME] === "" ){
      // Then this is a match that has not been scored.  Check with TBA to see if there is updated data.
      matchKey = data[i][Index.MATCH_KEY]
      if ( matchKey == null ){
        //This is unexpected.  Throw an exception.  
        throw new Error("Fail updating Qualification.  Match key was null on row:" + i)
      }else{
        // This is an update function, we shouldnt ignore cache whenupdating, just when resetting from the beginning.
        var jsonMatch = tbaQuery("match/" + matchKey , false )
        Logger.log(jsonMatch)
        data[i][Index.PREDICTED_TIME] = new Date(jsonMatch.predicted_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        data[i][Index.ACTUAL_TIME] = new Date(jsonMatch.actual_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        if ( jsonMatch['post_result_time'] ){
          data[i][Index.POST_RESULT_TIME] = new Date(jsonMatch.post_result_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
          scoreBreakdown(jsonMatch) // Adds breakdown to jsnMatch
          // Looks for each item in sbHeader in jsonMatch, and copies it to data
          sbHeader.forEach(element => {data[i][header.indexOf(element)] = jsonMatch[element]})
        } else{
          // Because the matches are in order, we expect that the rest of the matches also do not have updated results and scores.
          // We are expecting the scouting team to update after each match, or after a couple of matches
          // Stopping now does not updated predicted times, but does save a number of REST calls.
          // If there is a need to update predicted times, then the entire Qual Match can be fetched from the menu by init qual matches
          break;
        }
      }

    }
  } // End of iterating over all data in sheet
  // Must remember to replace the header
  data.unshift(header)
  // We don't need to clear the sheet because the data order and size should not have changed.
  sheet.getDataRange().setValues(data);
  loadTeamDetails()
  combineData()
}

function teamDetailsHeader(ignoreCache = false){
  var header = documentProperties.getProperty(Prop.TEAM_DETAILS_HEADER)
  if (header && ! ignoreCache) {return JSON.parse(header)}
    const eventKey = getEventKey()
  if ( eventKey == null ){
    throw new Error("Fail updating team details header, Event Key was null")
  }

  header =  ['oprs','ccwms','dprs'] // THis is from the /oprs endpoint and is defined in the api.
  var jsonRank =  tbaQuery("event/" + eventKey + "/rankings",ignoreCache) // THis will be cached, and used for loadTeamDetails.
  header = header.concat(['rank','wins','losses','ties','matches_played']) // Part of the api spec
  header = header.concat(jsonRank.sort_order_info.map(r => r.name))// sort_order and extra_stats can change year to year
  header = header.concat(jsonRank.extra_stats_info.map(r => r.name)) // THis assumes that there are no duplicates in sort_order and extra stats
  documentProperties.setProperty(Prop.TEAM_DETAILS_HEADER,JSON.stringify(header))
  return header
}

function loadTeamDetails(ignoreCache) {
  //
  const eventKey = getEventKey()
  if ( eventKey == null ){
    throw new Error("Fail updating team details, Event Key was null")
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  if ( sheet == null )
  {
    // Something went wrong, create the sheet with a call to another routine.
    loadEventTeams(ignoreCache)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  }
  var jsonOPR = tbaQuery("event/" + eventKey + "/oprs",ignoreCache)
  var jsonRank = tbaQuery("event/" + eventKey + "/rankings",ignoreCache)
  var rankHeader = []

  if ( jsonRank != null ){
    rankHeader = ['rank','wins','losses','ties','matches_played'].concat(jsonRank.sort_order_info.map(r => r.name)).concat(jsonRank.extra_stats_info.map(r => r.name))
    sortOrderCount = jsonRank.sort_order_info.length
    extraStatsCount = jsonRank.extra_stats_info.length
    rankData = {}
    jsonRank.rankings.forEach( row => {
      rankData[row.team_key] = [row.rank,row.record.wins,row.record.losses,row.record.ties,row.matches_played]
      rankData[row.team_key] = rankData[row.team_key].concat(row.sort_orders.slice(0,sortOrderCount)) 
      rankData[row.team_key] = rankData[row.team_key].concat(row.extra_stats.slice(0,extraStatsCount))    
    } )
  } // end of not jsonRank null

  if ( jsonRank == null && jsonOPR == null ){
    return;
  } // avoid expensive reading from sheet if there is nothing to update.

  var data = sheet.getDataRange().getValues();
  // First row is the header
  var header = data.shift()
  for (var i = 0; i < data.length; i++) {
    var teamKey = data[i][header.indexOf("key")]
    if ( jsonOPR != null ){
      data[i][header.indexOf("oprs")] = jsonOPR.oprs[teamKey]
      data[i][header.indexOf("ccwms")] = jsonOPR.ccwms[teamKey]
      data[i][header.indexOf('dprs')] = jsonOPR.dprs[teamKey]
    }
    if ( jsonRank != null ){
      rankHeader.forEach(element => {data[i][header.indexOf(element)] = rankData[teamKey][rankHeader.indexOf(element)]} )
    }    
  }
  data.unshift(header)
  sheet.getDataRange().setValues(data);
  
}
