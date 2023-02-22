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
 * 
 * 
 * Some notes about variable names:
 *   somethingResults are the results returned from an API call.  They are in JSON, and will need to be processed to be sent to the google sheet.
 *   somethingData is data that is read from a sheet, or that can be written back into a sheet. It is in an array format.
 *   somethingObjects is data that has been read in from a sheet, or otherwise generated and changed into an array of objects.
 * 
 */

// TODO: Freeze first row in each sheet
// TODO: Auto resize columns
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
  TEAM_SUMMARY : "Combined Team Summary",
  SPECIFIC_TEAM : "Specific Team"
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
      .addItem('Load Specific Team','specifyTeam')
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
  // Make changes directly to the incoming object
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

function scoreBreakdownSummary(matchObjects, summaryObjects){
  /**
   * matchObjects contains the entire sheet from Qualification reorganized
   * as an Object instead of an array.  The key is the match key.
   * 
   * summaryObjects is the array of objects containing summarized data 
   */

  Object.keys(summaryObjects).forEach( k => {
      summaryObjects[k]['taxi']=0;
      summaryObjects[k]['highest_climb']=0;
      summaryObjects[k]['total_climb_score']=0;
   })
   Object.keys(matchObjects).forEach( k => {
     if ( matchObjects[k]['post_result_time'] != ""){
       matchItem = matchObjects[k]
       if ( matchItem['red1_taxi'] == "Yes" ){ summaryObjects[matchItem['red1']]['taxi'] +=1 }
       if ( matchItem['red2_taxi'] == "Yes" ){ summaryObjects[matchItem['red2']]['taxi'] +=1 }
       if ( matchItem['red3_taxi'] == "Yes" ){ summaryObjects[matchItem['red3']]['taxi'] +=1 }
       if ( matchItem['blue1_taxi'] == "Yes" ){ summaryObjects[matchItem['blue1']]['taxi'] +=1 }
       if ( matchItem['blue2_taxi'] == "Yes" ){ summaryObjects[matchItem['blue2']]['taxi'] +=1 }
       if ( matchItem['blue3_taxi'] == "Yes" ){ summaryObjects[matchItem['blue3']]['taxi'] +=1 }
     }
   })

   Object.keys(summaryObjects).forEach( k => { summaryObjects[k]['taxi_success'] = summaryObjects[k]['taxi'] + "/" + summaryObjects[k]['matches_played'] + " success"} )
}

function scoutingSummaryHeader(){
  return ["No_Show", "Died_Disabled", 
    "Yellow_Flags", "Red_Flags", "Tipped_Over", 
    "Avg_Auton_Score", "Avg_Auton_GPs", 
    "Avg_Teleop_Score (no links)", "Avg_Teleop_GPs", 
    "Avg_Endgame_Score", "Pieces_Scored", "Matches_Played"]
}

function scoutingSummary(summaryObjects, scoutingObjects){
  // Read in scouting sheet, 
  // do calculations on it to return a summary.
  Object.keys(summaryObjects).forEach( k => {
      summaryObjects[k]['No_Show']=0;
      summaryObjects[k]['Died_Disabled']=0;
      summaryObjects[k]['Yellow_Flags']=0;
      summaryObjects[k]['Red_Flags']=0;
      summaryObjects[k]['Tipped_Over']=0;
      summaryObjects[k]['Avg_Auton_Score']=0;
      summaryObjects[k]['Avg_Auton_GPs']=0;
      summaryObjects[k]['Avg_Teleop_Score (no links)']=0;
      summaryObjects[k]['Avg_Teleop_GPs']=0;
      summaryObjects[k]['Avg_Endgame_Score']=0;
      summaryObjects[k]['Matches_Played']=0;
      summaryObjects[k]['Pieces_Scored']="none";
   })
   Object.keys(scoutingObjects).forEach( k => {
      scoutingItem = scoutingObjects[k]
      var autonScore = 0  
      var autonGP = 0
      var teleopScore = 0
      var teleopGP = 0
      var endgameScore = 0

      if ( scoutingItem['No Show'] == true ){ 
        summaryObjects[scoutingItem['Team Number']]['No_Show'] +=1 
      }
      else { summaryObjects[scoutingItem['Team Number']]['Matches_Played'] += 1 }
      if ( scoutingItem['Died/Disabled'] == true ){ 
        summaryObjects[scoutingItem['Team Number']]['Died_Disabled'] +=1 
      }
      if ( scoutingItem['Flagged'] == "YELLOW" ){ 
        summaryObjects[scoutingItem['Team Number']]['Yellow_Flags'] +=1 
      }
      if ( scoutingItem['Flagged'] == "RED" ){ 
        summaryObjects[scoutingItem['Team Number']]['Red_Flags'] +=1
      }
      if ( scoutingItem['Tipped Over'] == true ){ 
        summaryObjects[scoutingItem['Team Number']]['Tipped_Over'] +=1 
      }

      if ( summaryObjects[scoutingItem['Team Number']]['Matches_Played'] > 0 ) {
        if ( scoutingItem['Mobility Bonus'] == true ){
          autonScore +=3
        }
        if (scoutingItem['Docked/Engaged'] == "DOCK" ){
          autonScore +=8
        }
        if (scoutingItem['Docked/Engaged'] == "ENGAGED" ){
          autonScore +=12
        }
        autonScore += scoutingItem['Auton High Pieces Scored']*6
        autonScore += scoutingItem['Auton Mid Pieces Scored']*4
        autonScore += scoutingItem['Auton Low Pieces Scored']*3
        autonGP += scoutingItem['Auton High Pieces Scored']+scoutingItem['Auton Mid Pieces Scored']+scoutingItem['Auton Low Pieces Scored']
        summaryObjects[scoutingItem['Team Number']]['Avg_Auton_Score'] += autonScore
        summaryObjects[scoutingItem['Team Number']]['Avg_Auton_GPs'] += autonGP

        teleopScore += scoutingItem['Teleop High Pieces Scored']*5
        teleopScore += scoutingItem['Teleop Mid Pieces Scored']*3
        teleopScore += scoutingItem['Teleop Low Pieces Scored']*2
        teleopGP += scoutingItem['Teleop High Pieces Scored']+scoutingItem['Teleop Mid Pieces Scored']+scoutingItem['Teleop Low Pieces Scored']
        summaryObjects[scoutingItem['Team Number']]['Avg_Teleop_Score (no links)'] += teleopScore
        summaryObjects[scoutingItem['Team Number']]['Avg_Teleop_GPs'] += teleopGP

        if (scoutingItem['Endgame Position'] == "PARK" ){
          endgameScore +=2
        }
        if (scoutingItem['Endgame Position'] == "DOCK" ){
          endgameScore +=6
        }
        if (scoutingItem['Endgame Position'] == "ENGAGED" ){
          endgameScore +=10
        }
        summaryObjects[scoutingItem['Team Number']]['Avg_Endgame_Score'] += endgameScore
      }

      if ( summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] == "none" ) {
        if (scoutingItem['Pieces Scored on Mid/High'] == "BOTH" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "both"
          }
        if (scoutingItem['Pieces Scored on Mid/High'] == "CUBES" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "cubes"
          }
        if (scoutingItem['Pieces Scored on Mid/High'] == "CONES" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "cones"
          }
      }
      if ( summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] == "cones" ) {
        if (scoutingItem['Pieces Scored on Mid/High'] == "BOTH" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "both"
          }
        if (scoutingItem['Pieces Scored on Mid/High'] == "CUBES" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "both"
          }
      }
      if ( summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] == "cubes" ) {
        if (scoutingItem['Pieces Scored on Mid/High'] == "BOTH" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "both"
          }
        if (scoutingItem['Pieces Scored on Mid/High'] == "CONES" ){
            summaryObjects[scoutingItem['Team Number']]['Pieces_Scored'] = "both"
          }
      }
   })  
  Object.keys(summaryObjects).forEach( k => {
    if ( summaryObjects[k]['Matches_Played'] > 0 ) {
      summaryObjects[k]['Avg_Auton_Score'] = summaryObjects[k]['Avg_Auton_Score']/summaryObjects[k]['Matches_Played']
      summaryObjects[k]['Avg_Auton_GPs'] = summaryObjects[k]['Avg_Auton_GPs']/summaryObjects[k]['Matches_Played']
      summaryObjects[k]['Avg_Teleop_Score (no links)'] = summaryObjects[k]['Avg_Teleop_Score (no links)']/summaryObjects[k]['Matches_Played']
      summaryObjects[k]['Avg_Teleop_GPs'] = summaryObjects[k]['Avg_Teleop_GPs']/summaryObjects[k]['Matches_Played']
      summaryObjects[k]['Avg_Endgame_Score'] = summaryObjects[k]['Avg_Endgame_Score']/summaryObjects[k]['Matches_Played']
    }
  })

  return summaryObjects
}

function specificScoutingSummaryHeader(){
  return ["Auton Score", "Teleop Score", "Endgame Score", "Total Score"]
}

function specificScoutingSummary(specificTeamObjects, specificScoutingObjects){
  /**Object.keys(specificTeamObjects).forEach( k => {
      Logger.log("Hey")
      specificTeamObjects[k]['Auton Score']=0;
      specificTeamObjects[k]['Teleop Score']=0;
      specificTeamObjects[k]['Endgame Score']=0;
      specificTeamObjects[k]['Total Score']=0;
   })**/
  Object.keys(specificScoutingObjects).forEach( k => {
      specificScoutingItem = specificScoutingObjects[k]
      //Logger.log(specificScoutingItem)
      specificScoutingItem['Auton Score'] = 0
      specificScoutingItem['Teleop Score'] = 0
      specificScoutingItem['Endgame Score'] = 0
      specificScoutingItem['Total Score'] = 0

      var autonScore = 0  
      var teleopScore = 0
      var endgameScore = 0
      
      if ( specificScoutingItem['Mobility Bonus'] == true ){
        autonScore +=3
      }
      if ( specificScoutingItem['Docked/Engaged'] == "DOCK" ){
        autonScore +=8
      }
      if ( specificScoutingItem['Docked/Engaged'] == "ENGAGED" ){
        autonScore +=12
      }
      autonScore += specificScoutingItem['Auton High Pieces Scored']*6
      autonScore += specificScoutingItem['Auton Mid Pieces Scored']*4
      autonScore += specificScoutingItem['Auton Low Pieces Scored']*3

      teleopScore += specificScoutingItem['Teleop High Pieces Scored']*5
      teleopScore += specificScoutingItem['Teleop Mid Pieces Scored']*3
      teleopScore += specificScoutingItem['Teleop Low Pieces Scored']*2

      if (specificScoutingItem['Endgame Position'] == "PARK" ){
        endgameScore +=2
      }
      if (specificScoutingItem['Endgame Position'] == "DOCK" ){
        endgameScore +=6
      }
      if (specificScoutingItem['Endgame Position'] == "ENGAGED" ){
        endgameScore +=10
      }
      Logger.log(specificScoutingItem)
      
      specificScoutingItem['Auton Score'] = autonScore
      specificScoutingItem['Teleop Score'] = teleopScore
      specificScoutingItem['Endgame Score'] = endgameScore
      specificScoutingItem['Total Score'] = autonScore + teleopScore + endgameScore
      specificTeamObjects.push(specificScoutingItem)
    }
  )
  return specificTeamObjects

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

function combineData(){
  // Combine all TBA, Scoring breakdown, and Scouting data into one large sheet by team.
  // This sheet can then be used as a source for vlookups and query's for results
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAM_SUMMARY)
  if ( sheet == null )
  {
    SpreadsheetApp.getActive().insertSheet(Sheet.TEAM_SUMMARY)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAM_SUMMARY)
  }  
  var header = ["team_number","nickname"]
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
  
  var summaryObjects = {} 
  for (var i = 0; i < teamData.length; i++) {
    summaryObjects[teamData[i][TeamIndex.TEAM_NUMBER]] = {}
    summaryObjects[teamData[i][TeamIndex.TEAM_NUMBER]]['nickname']=teamData[i][TeamIndex.NICKNAME]
    tdHeader.forEach(element => {summaryObjects[teamData[i][TeamIndex.TEAM_NUMBER]][element] = teamData[i][teamHeader.indexOf(element)] })
  }
  var matchSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS)
  var matchData = matchSheet.getDataRange().getValues()
  var matchHeader = matchData.shift()
  var matchObjects = {}
  matchData.forEach(r => { 
    const localKey = r[matchHeader.indexOf('key')]
    matchObjects[localKey] = {};
    matchHeader.forEach( h => matchObjects[localKey][h]=r[matchHeader.indexOf(h)] )
  })  
  scoreBreakdownSummary(matchObjects,summaryObjects)

  var scoutingSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.SCOUTING)
  var scoutingData = scoutingSheet.getDataRange().getValues()
  var scoutingHeader = scoutingData.shift()
  var scoutingObjects = []
  scoutingData.forEach(r => { 
    const localObject = {}
    scoutingHeader.forEach( h => localObject[h]=r[scoutingHeader.indexOf(h)] )
    scoutingObjects.push(localObject)
  })
  scoutingSummary(summaryObjects, scoutingObjects)

  const summaryData = Object.entries(summaryObjects).map(([k, v]) => {
    v["team_number"]=k;
    return header.map(h => v[h]);
  });
  
  summaryData.sort((a, b) => { return Number(a[0]) - Number(b[0])} ); // Position from header above.
  summaryData.unshift(header);  // Add the header back to the data at the first row
  sheet.clear();
  sheet.getRange(1, 1, summaryData.length, summaryData[0].length).setValues(summaryData);
}

function specifyTeam(){
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.SPECIFIC_TEAM)
  if ( sheet == null )
  {
    SpreadsheetApp.getActive().insertSheet(Sheet.SPECIFIC_TEAM)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.SPECIFIC_TEAM)
  }  
  var header = ["Match Number"]
  header = header.concat(specificScoutingSummaryHeader())

  var sTeamSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  var sTeamData = sTeamSheet.getDataRange().getValues();
  // First row is the header
  var sTeamHeader = sTeamData.shift()
  // Translate the data into an object.  Easier to append information
  const TeamIndex =  {
    MATCH_NUMBER : sTeamHeader.indexOf('Match Number'),
  }

  var specificTeamObjects = [] 
  for (var i = 0; i < sTeamData.length; i++) {
    specificTeamObjects[sTeamData[i][TeamIndex.MATCH_NUMBER]] = {}
  }

  const teamNumber = sheet.getRange(1, 2, 1, 1).getDisplayValue()
  //Logger.log(teamNumber)

  var specificScoutingSheet = SpreadsheetApp.getActive().getSheetByName(Sheet.SCOUTING)
  var specificScoutingData = specificScoutingSheet.getDataRange().getValues()
  var specificScoutingHeader = specificScoutingData.shift()
  var specificScoutingObjects = []
  specificScoutingData.forEach(r => { 
    const localObject = {}
    specificScoutingHeader.forEach( h => localObject[h]=r[specificScoutingHeader.indexOf(h)] )
    if (localObject['Team Number'] == teamNumber) {
      //Logger.log(localObject)
      specificScoutingObjects.push(localObject)
    }
  })
  //Logger.log(specificScoutingObjects)
  specificScoutingSummary(specificTeamObjects, specificScoutingObjects)

  const specificTeamData = Object.entries(specificTeamObjects).map(([k, v]) => {
    //v["Match Number"]=k;
    return header.map(h => v[h]);
  });

  specificTeamData.sort((a, b) => { return Number(a[0]) - Number(b[0])} ); 
  specificTeamData.unshift(header);  
  sheet.getRange(3, 1, specificTeamData.length, specificTeamData[0].length).setValues(specificTeamData); 
  //Logger.log(specificTeamObjects)
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
  loadFinalMatches(false); //loadQualMatches has just fetched a new cache, silly to ignore it again.
  combineData();
  specifyTeam();
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

  teamsResult = tbaQuery('event/' + eventKey + '/teams/simple',ignoreCache)

  const teamsData = Object.entries(teamsResult).map(([k, v]) => {
    return header.map(h => v[h]);
  });
  teamsData.sort((a, b) => { return Number(a[1]) - Number(b[1])} ); // Position from header above.
  teamsData.unshift(header);  // Add the header back to the data at the first row
  sheet.clear();
  sheet.getRange(1, 1, teamsData.length, teamsData[0].length).setValues(teamsData);
  loadTeamDetails(ignoreCache)
}

function loadQualMatches(ignoreCache = false){
  loadMatches_(ignoreCache,Match.QUALIFICATIONS)
  combineData()
  specifyTeam()
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
  var matchResults = tbaQuery('event/' + e + '/matches',ignoreCache)
  var timeZone = Session.getScriptTimeZone();
  var header = initHeader.concat(scoreBreakdownHeader());
  const matchData = Object.entries(matchResults).filter(([k, v]) => { return matchType == Match.QUALIFICATIONS ? v.comp_level === "qm" : v.comp_level != "qm" }).map(([k, v]) => {
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
  matchData.sort((a, b) => { return Number(a[4]) - Number(b[4])} ); // Position from header above.
  matchData.unshift(header);  // Add the header to the array
  sheet.clear(); // Remove any old data. Otherwise, you may have data at the end that doesnt belong.
  sheet.getRange(1, 1, matchData.length, matchData[0].length).setValues(matchData);  
}

function updateQualResults() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.QUALIFICATIONS);
  // If the sheet doesn't exist, then let's just call loadQualMatches, which will create and fill the entire sheet
  if ( sheet === null ) {
    loadQualMatches()
    loadTeamDetails()
    combineData()
    specifyTeam()
    return
  }
  const timeZone = Session.getScriptTimeZone();
  var qualData = sheet.getDataRange().getValues();
  // First row is the header
  var header = qualData.shift()
  const sbHeader = scoreBreakdownHeader()
  // Capture some important column ids 
  const Index =  {
    MATCH_KEY : header.indexOf('key'),
    PREDICTED_TIME : header.indexOf('predicted_time'),
    ACTUAL_TIME : header.indexOf('actual_time'),
    POST_RESULT_TIME : header.indexOf('post_result_time')
  }
  for (var i = 0; i < qualData.length; i++) {
    if ( qualData[i][Index.POST_RESULT_TIME] === "" ){
      // Then this is a match that has not been scored.  Check with TBA to see if there is updated data.
      matchKey = qualData[i][Index.MATCH_KEY]
      if ( matchKey == null ){
        //This is unexpected.  Throw an exception.  
        throw new Error("Fail updating Qualification.  Match key was null on row:" + i)
      }else{
        // This is an update function, we shouldnt ignore cache whenupdating, just when resetting from the beginning.
        var matchResults = tbaQuery("match/" + matchKey , false )
        qualData[i][Index.PREDICTED_TIME] = new Date(matchResults.predicted_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        qualData[i][Index.ACTUAL_TIME] = new Date(matchResults.actual_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
        if ( matchResults['post_result_time'] ){
          qualData[i][Index.POST_RESULT_TIME] = new Date(matchResults.post_result_time*1000).toLocaleString('en-US', {timeZone: timeZone} )
          scoreBreakdown(matchResults) // Adds breakdown to jsnMatch
          // Looks for each item in sbHeader in jsonMatch, and copies it to data
          sbHeader.forEach(element => {qualData[i][header.indexOf(element)] = matchResults[element]})
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
  qualData.unshift(header)
  // We don't need to clear the sheet because the data order and size should not have changed.
  sheet.getDataRange().setValues(qualData);
  loadTeamDetails()
  combineData()
  specifyTeam()
}

function teamDetailsHeader(ignoreCache = false){
  var header = documentProperties.getProperty(Prop.TEAM_DETAILS_HEADER)
  if (header && ! ignoreCache) {return JSON.parse(header)}
    const eventKey = getEventKey()
  if ( eventKey == null ){
    throw new Error("Fail updating team details header, Event Key was null")
  }

  header =  ['oprs','ccwms','dprs'] // This is from the /oprs endpoint and is defined in the api.
  var rankResults =  tbaQuery("event/" + eventKey + "/rankings",ignoreCache) // This will be cached, and used for loadTeamDetails.
  header = header.concat(['rank','wins','losses','ties','matches_played']) // Part of the api spec
  header = header.concat(rankResults.sort_order_info.map(r => r.name))// sort_order and extra_stats can change year to year
  header = header.concat(rankResults.extra_stats_info.map(r => r.name)) // This assumes that there are no duplicates in sort_order and extra stats

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
    loadEventTeams(ignscoreCache)
    sheet = SpreadsheetApp.getActive().getSheetByName(Sheet.TEAMS)
  }
  var oprResults = tbaQuery("event/" + eventKey + "/oprs",ignoreCache)
  var rankResults = tbaQuery("event/" + eventKey + "/rankings",ignoreCache)
  var rankHeader = []

  if ( rankResults != null ){
    rankHeader = ['rank','wins','losses','ties','matches_played'].concat(rankResults.sort_order_info.map(r => r.name)).concat(rankResults.extra_stats_info.map(r => r.name))
    sortOrderCount = rankResults.sort_order_info.length
    extraStatsCount = rankResults.extra_stats_info.length
    rankData = {}
    rankResults.rankings.forEach( row => {
      rankData[row.team_key] = [row.rank,row.record.wins,row.record.losses,row.record.ties,row.matches_played]
      rankData[row.team_key] = rankData[row.team_key].concat(row.sort_orders.slice(0,sortOrderCount)) 
      rankData[row.team_key] = rankData[row.team_key].concat(row.extra_stats.slice(0,extraStatsCount))    
    } )
  } // end of not rankResults null

  if ( rankResults == null && oprResults == null ){
    return;
  } // avoid expensive reading from sheet if there is nothing to update.

  var data = sheet.getDataRange().getValues();
  // First row is the header
  var header = data.shift()
  for (var i = 0; i < data.length; i++) {
    var teamKey = data[i][header.indexOf("key")]
    if ( oprResults != null ){
      data[i][header.indexOf("oprs")] = oprResults.oprs[teamKey]
      data[i][header.indexOf("ccwms")] = oprResults.ccwms[teamKey]
      data[i][header.indexOf('dprs')] = oprResults.dprs[teamKey]
    }
    if ( rankResults != null ){
      rankHeader.forEach(element => {data[i][header.indexOf(element)] = rankData[teamKey][rankHeader.indexOf(element)]} )
    }    
  }
  data.unshift(header)
  sheet.getDataRange().setValues(data);
  
}

