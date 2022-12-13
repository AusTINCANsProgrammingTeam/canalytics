 # Overview
 
 The included script is to be used by Google Sheets in order to pull data efficiently from The Blue Alliance ( TBA )
 The script will attempt to cache information, as well as check with TBA to see if the data has changed, even if the cache time is stale.
 
 The intention is to store the data in a format that is easy to combine with scouting data, as well as create insights using pivot tables and scripting.
  
 “Powered by The Blue Alliance” :thebluealliance.com

# To install

Open a new Google Sheet
Click on Extensions
Click on AppScripts
Push the plus for "Add a File"
Name the new file "canalytics.gs"
Copy and paste the contents of the file from github into the AppScript file
Click on the antiquated floppy icon to save
Reload the spreadsheet, and look for the "ausTIN CANalytics" menu

# To operate
- Get a "The Blue Alliance" API Key here:  https://www.thebluealliance.com/account
- Choose the menu item for "TBA API Key" and add the key into the prompt.
- Choose an event key. ( Hint: Look on TBA for them.  One example is 2022txaus )
- The Menu item for "Event Key and Initialize" will create new sheets for "Teams" and "Qualification" with as much information as possible
- to entirely recreate the Qualification sheet or the Teams sheet, use the "Init" menu items.
- Use the "Update Match Results" menu item to only update the newly scored matches.

# To Do

The script was created with the basic functionality in place, however there are a number of things that need to be done:
- review canalytics.gs for TODO items and resolve.
- Create a new function to find the next match for the specified team
- Create plots and summaries on different sheets through code
  - A Match Predictor ( Using both OPR, and scouting, what is the most likely outcome in autonomous, and overall match score for a particular match)
  - A Team Display ( Summary of all matches played by team, is their OPR rising or falling, what other performance indicators can we show )
  - A fantasy match up: Given any six teams, what does the match predictor say about the alliance performance and chances to win.
- Adjust the function that reads the scoreBreakdown for the current year game.
- Plan for scouting input.  Most likely, we will be using:  https://scout.iraiders.org/ https://github.com/iraiders/QRScout
