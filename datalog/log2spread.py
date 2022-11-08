#!/usr/bin/python3
""" Input: CSV from DataLogTool
The CSV must have additional code to log an increasing number before the CommandScheduler.run() command in Robot.java/robotPeriodic.

Output: A CSV, with a filtered list of log entries appropriate for inputing into a spreadsheet program.

Purpose:  This is an example, there are a ton of ideas that you can do to make this more useful:
- Allow the filter to be changed on the command line.
  ( like the filename )
- Read in multiple files, and do something reasonable with the output.
  ( Add a column for each filename maybe? )
- Choices about what to do if there are two log entries in one loop of Command Scheduler
  ( first value is not always the right choice: mean, max, quit with an error are other choices. )
- Calculate loop periods, and warn if the loop with logs took more than 20ms.
- Specify an output file name as a parameter
- if there is not a header of "Timestamp,Name,Value" then try and recover.
- read directly from wpilog instead of CSV ( wpi has some utilities that should help ) 

""" 

import numpy as np
import pandas as pd
import argparse
import re

# This makes sure that it will display everything if we print to check out work.
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 300)

# Read in the script parameters
# https://docs.python.org/3/library/argparse.html#module-argparse
parser = argparse.ArgumentParser(
                    prog = 'log2spread',
                    description = 'Create a CSV suitable for a spreadsheet program from DataLogTool output',
                    epilog = 'This script is an example, check the code for more ideas on how to improve')

parser.add_argument("filename")
args = parser.parse_args()


# Read in file as CSV. We need the first line to contain the header.
# We need all lines to have a timestamp, and there to be lines with /schedgen that do not have the same timestamp.
df = pd.read_csv(args.filename,na_filter=False,)

# Save all of the lines with name of schedgen in a new dataframe. 
# In our code, this is called once per robot loop, in Robot.java right before calling CommandScheduler.run
# https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.loc.html#pandas.DataFrame.loc
generations = df.loc[df['Name'] == "/schedgen" ]
# We need the start and end of the Schedule Generation, so we shift the next row's timestamp 
# backwards into a new column called End.
generations['End'] = generations['Timestamp'].shift(-1)
# We should have one End having no value, we take the maximum value from our original dataframe and save that in End.
generations.loc[pd.isna(generations["End"]),"End"] = max(df["Timestamp"])
# We also want a generation from the very earliest timestamp until the first schedgen row
# this captures all data from when the robot turns on until the robot is enabled.
first_gen = pd.DataFrame([[0,'/schedgen',0,min(generations['Timestamp'])]], 
                         columns = ['Timestamp','Name','Value','End'])
generations = pd.concat([first_gen,generations], ignore_index = True )

# input a dataframe, extract the series that matches with Name column,
# return a series with True in any of the rows with a Name column matching our list of specific names.
def keep_names( df ):
 names = df.loc[:,'Name']
 return names.apply(lambda n: n in ['/swerve/txout','/swerve/txout','/schedgen'])

# input a dataframe, extract the series that matches with Name column,
# return a series with True in any of the rows where the Name column matches a regular expression
# "swerve|navX.*value|schedgen" means swerve anywhere in the string, or schedgen anywhere in the string.
# or navX followed by any characters, followed by Value.
def keep_names_re( df ):
 names = df.loc[:,'Name']
 reg = re.compile(r"swerve|navX.*Value|schedgen")
 return names.apply(lambda n: bool(reg.search(n)))
 
# Only keep the Names that we want.
# Need to keep /schedgen for the rest of the script to work
df = df.loc[lambda x: keep_names_re(x)]

# input a row, and return the timestamp of the Command Scheduler generation that matches the timestamp
def find_generation ( row ):
  ts = row.Timestamp
  # generations.loc with & returns a series.  
  # we should only have one match in generations for any given timestamp.
  # so we change the series to the values, and return the first one.
  t =  generations.loc[(generations['Timestamp'] < ts ) & (generations['End'] >= ts ),'Timestamp'].values[0]
  return t

df["GenTimestamp"] = df.apply(
    lambda row: find_generation(row),
    axis = 1
)

# print(df.head(10))
# This changes the data from Timestamp,Name,Value to more of a table, with each row having a timestamp
# and the column headers being the individual Names that we kept.
# If there are two logs in one schedgen, then we only keep the first one.
data_table = df.pivot_table( index='GenTimestamp', columns = 'Name', values = 'Value', aggfunc = 'first' )
data_table.to_csv("finished.csv")
