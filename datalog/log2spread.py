#!/usr/bin/python3
""" Input: CSV from DataLogTool
The CSV must have additional code to log an increasing number before the CommandScheduler.run() command in Robot.java/robotPeriodic.

Output: A CSV, with a filtered list of log entries appropriate for inputing into a spreadsheet program.

Purpose:  This is an example, there are a ton of ideas that you can do to make this more useful:
- Allow the filter to be changed on the command line.
  ( like the filename )
- Choices about what to do if there are two log entries in one loop of Command Scheduler
  ( first value is not always the right choice: mean, max, quit with an error are other choices. )
- Calculate loop periods, and warn if the loop with logs took more than 20ms.
- Specify an output file name as a parameter
- if there is not a header of "Timestamp,Name,Value" then try and recover.
- read directly from wpilog instead of CSV ( wpi has some utilities that should help ) 

""" 

import os
import numpy as np
import pandas as pd
import argparse
import re
import plotly.express as px

#Command To Run:
#python datalog/log2spread.py datalog/input_files

#Enter the names of the variables you would want read
columns = ['/swerve/txout','/swerve/tyout', '/robot/loopCount']

# return a series with True in any of the rows with a Name column matching our list of specific names.
def keep_names( df ):
 names = df.loc[:,'Name']
 return names.apply(lambda n: n in columns)

# input a row, and return the timestamp of the Command Scheduler generation that matches the timestamp
def find_generation ( row ):
  ts = row.Timestamp
  # generations.loc with & returns a series.  
  # we should only have one match in generations for any given timestamp.
  # so we change the series to the values, and return the first one.
  t =  generations.loc[(generations['Timestamp'] < ts ) & (generations['End'] >= ts ),'Timestamp'].values[0]
  return t

#Place the file in the Output_files folder
def log_output(filename, data):
  if not os.path.exists('datalog/output_files'):
    os.mkdir('datalog/output_files')
  data.to_csv('datalog/output_files/'+filename.split('.')[0] + '_output.csv')

# Read in the script parameters
# https://docs.python.org/3/library/argparse.html#module-argparse
parser = argparse.ArgumentParser(
                    prog = 'log2spread',
                    description = 'Create a CSV suitable for a spreadsheet program from DataLogTool output',
                    epilog = 'This script is an example, check the code for more ideas on how to improve')

#Add the requirment of adding the file name to cammand line
parser.add_argument("filename")
args = parser.parse_args()


# Read in file as CSV. We need the first line to contain the header.
# We need all lines to have a timestamp, and there to be lines with /loopCount that do not have the same timestamp.
file_paths = [file for file in os.listdir(args.filename) if file.endswith('.csv')]
df_list = []

for path in file_paths:
  df_list.append(pd.read_csv(f'{args.filename}/'+path,na_filter=False,))


for i, df in enumerate(df_list):
  # Save all of the lines with name of loopCount in a new dataframe. 
  # In our code, this is logged once per robot loop, in Robot.java right before calling CommandScheduler.run
  generations = df.loc[df['Name'] == "/robot/loopCount" ]

  # We need the start and end of the Schedule Generation, 
  # so we shift the next row's timestamp backwards into a new column called End
  # The lines should already be in sorted order.
  generations['End'] = generations['Timestamp'].shift(-1)

  # We should have one generation with an end that has no value.
  # Tthe maximum value from our original dataframe is the end for that generation.
  generations.loc[pd.isna(generations["End"]),"End"] = max(df["Timestamp"])

  # We also want a generation from the very earliest timestamp until the first loopCount row
  # this captures all data from when the robot turns on until the robot is enabled.
  first_gen = pd.DataFrame([[0,'/robot/loopCount',0,min(generations['Timestamp'])]], 
                          columns = ['Timestamp','Name','Value','End'])
  generations = pd.concat([first_gen,generations], ignore_index = True )
  
  # Only keep the Names that we want.
  # Need to keep /loopCount for the rest of the script to work
  df = df.loc[lambda x: keep_names(x)]

  df["GenTimestamp"] = df.apply(
      lambda row: find_generation(row),
      axis = 1
  )

  # This can be used to check any of the steps
  # print(df.head(10))

  # This changes the data from Timestamp,Name,Value to more of a table, with each row having a timestamp
  # and the column headers being the individual Names that we kept.
  # If there are two log entries in one generation, then we only keep the first one.
  data_table = df.pivot_table( index='GenTimestamp', columns = 'Name', values = 'Value', aggfunc = 'first' )

  log_output(file_paths[i], data_table)