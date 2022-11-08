#!/usr/bin/python3
""" Input: CSV from DataLogTool

Output: A plot with two or more numeric values from the CSV

Purpose:  This is an example, there are a ton of ideas that you can do to make this more useful:
    - Special purpose plots with the goal of tuning all PIDs on a robot.
    - Multiple plots, for example showing values in a scatterplot, and battery voltage in another plot below.
    - reading directly from wpilog instead of from csv
    - Competition plot, showing voltage, current , autonomous/teleop/endgame and other challenge specific data
    - creating a python library with common routines from these examples. ( Don't Repeat Yourself )

No Pie charts.  Seriously.  Don't do that.  It's not a good idea.  No, not even then.

""" 

import numpy as np
import pandas as pd
import plotly.express as px
import re
import argparse


# This makes sure that it will display everything if we print to check out work.
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 300)

# Read in the script parameters
# https://docs.python.org/3/library/argparse.html#module-argparse
parser = argparse.ArgumentParser(
                    prog = 'log2plot',
                    description = 'Create a scatterplot of one or more log entry names',
                    epilog = 'This script is an example, check the code for more ideas on how to improve')

parser.add_argument("filename")
args = parser.parse_args()


# Read in file as CSV. We need the first line to contain the header.
# We need all lines to have a timestamp
df = pd.read_csv(args.filename,na_filter=False,)

# remove all but the lines that we are plotting.
# This will make programming more straightforward as well as processing quicker

# input a dataframe, extract the series that matches with Name column,
# return a series with True in any of the rows with a Name column matching our list of specific names.
def keep_names( df ):
 names = df.loc[:,'Name']
 return names.apply(lambda n: n in ['/swerve/FL/actual/angle','/swerve/FL/set/angle'])

# input a dataframe, extract the series that matches with Name column,
# return a series with True in any of the rows where the Name column matches a regular expression
# "swerve.*FL.*angle" means swerve anywhere in the string followed by any characters, followed by FL, followed
#   by any characters, followed by angle
def keep_names_re( df ):
 names = df.loc[:,'Name']
 reg = re.compile(r"swerve.*FL.*angle")
 return names.apply(lambda n: bool(reg.search(n)))

# Only keep the Names that we want.
df = df.loc[lambda x: keep_names_re(x)]
 
# Need to convert the exponential form of the value to a numeric value
# Need to make sure that all values are able to be made numeric.  Can't plot strings
df['NumValue']=pd.to_numeric(df['Value'])
print(df.tail(10))

# Plot a scatterplot, with a different color and dot shape for each Name.
fig = px.scatter(df, x="Timestamp", y="NumValue", color="Name", symbol="Name")
fig.show()
