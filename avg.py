from flask import Flask, render_template, request, jsonify, redirect, url_for, session, make_response
import pandas as pd
import os
import threading
import tkinter as tk
from tkinter import messagebox
from tkinter import ttk
import requests
from bs4 import BeautifulSoup
import time
import secrets
import datetime as dt  # Rename datetime module import to dt to avoid conflicts
import psutil
import platform
from datetime import datetime, timedelta  # Now explicitly import datetime and timedelta
import socket
import json
import numpy as np

# Import the ConfigLoader
from config_loader import config_loader

# Import the AI assistant module
import ai_assistant

# Flag to indicate if the device is a scanner - now loaded from config
ScannerDevice = config_loader.get_value('scanner_device', True, section='server')

# Configuration for authentication - now loaded from config
REQUIRE_LOGIN = config_loader.get_value('require_login', True, section='server')

# Default configuration that will be updated from frontend
GAME_CONFIG = config_loader.get_config()

# Configuration lock to prevent race conditions when updating
config_lock = threading.Lock()

# User credentials - now loaded from config
USERS = config_loader.get_value('users', {})

# Initialize Flask app
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)  # Generate a secure random secret key

# Session configuration - Fix the timedelta reference
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)  # Keep sessions for 30 days

# Track connected clients globally
connected_clients = set()
client_lock = threading.Lock()
last_requests = {}
client_locations = {}

# Function to download the Excel file if not found locally
def download_excel_file(url, local_path):
    try:
        response = requests.get(url)
        response.raise_for_status()  # Check if the request was successful

        # Parse the HTML content to find the actual Excel file URL
        soup = BeautifulSoup(response.content, 'html.parser')
        file_url = None
        for script in soup.find_all('script'):
            if 'FileGetUrl' in script.text:
                start = script.text.find('FileGetUrl') + len('FileGetUrl":"')
                end = script.text.find('"', start)
                file_url = script.text[start:end].replace('\\u0026', '&')
                break

        if file_url:
            file_response = requests.get(file_url)
            file_response.raise_for_status()
            with open(local_path, 'wb') as file:
                file.write(file_response.content)
            print(f"Downloaded the Excel file from {file_url}")
        else:
            print("Failed to find the Excel file URL in the HTML content.")
    except Exception as e:
        print(f"Failed to download the Excel file: {e}")

# Function to periodically download and replace the Excel file
def periodic_download(url, local_path, interval):
    while True:
        if not ScannerDevice:
            download_excel_file(url, local_path)
        time.sleep(interval)

# Get configuration values from config.js
excel_url = config_loader.get_value('excel_url', 
    'https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', 
    section='server')
local_file_path = config_loader.get_value('local_file_path', 'qr_codes.xlsx', section='server')
refresh_interval = config_loader.get_value('data_refresh_interval', 150, section='server')

# Start the periodic download in a separate thread if not a scanner device
if not ScannerDevice:
    download_thread = threading.Thread(target=periodic_download, args=(
        excel_url,
        os.path.join(os.path.dirname(os.path.realpath(__file__)), local_file_path),
        refresh_interval  # Use interval from config
    ))
    download_thread.daemon = True
    download_thread.start()

# Function to load and process the data, calculate averages
def calculate_averages():
    try:
        # Get the current configuration
        current_config = config_loader.get_config()
        
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, local_file_path)

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Define the relevant columns: team number is in column 'Team Number'
        team_column = current_config.get('team_column', 'Team Number')

        # Columns to exclude
        exclude_columns = current_config.get('exclude_columns', [])

        # Columns to include
        include_columns = current_config.get('include_columns', [])

        # Automatically select columns to average (include only the specified columns)
        data_columns = [col for col in df.columns if col in include_columns]

        # Get the search query (using parameter instead of Tkinter entry)
        search_query = ""  # Default empty search

        # Initialize an empty dictionary to store the averages for each team
        team_averages = {}

        # If a search query is provided, filter by that team number
        if search_query:
            # Ensure that the search query is numeric (team number)
            if not search_query.isdigit() or int(search_query) == 0:
                print("Invalid Input: Please enter a valid team number.")
                return {}
            # Filter the dataframe by the team number
            team_data = df[df[team_column] == int(search_query)]

            if team_data.empty:
                print(f"No Results: No results found for Team {search_query}.")
                return {}

            # Calculate the averages for the filtered team data
            averages = team_data[data_columns].mean()
            team_averages[search_query] = averages
        else:
            # Iterate through all unique team numbers and calculate averages
            for team in df[team_column].unique():
                if team == 0:
                    continue
                # Filter the rows that match the current team number
                team_data = df[df[team_column] == team]

                # Calculate the average for each of the specified columns
                averages = team_data[data_columns].mean()

                # Store the averages for the current team
                team_averages[team] = averages

        # Save the results to a new Excel file
        output_file_path = os.path.join(script_dir, 'team_averages.xlsx')
        with pd.ExcelWriter(output_file_path, engine='openpyxl') as writer:
            averages_df = pd.DataFrame(team_averages).T  # Transpose to get teams as rows
            averages_df.to_excel(writer, index_label='Team Number')

        print("Success: Averages calculated and saved successfully.")
        return team_averages

    except Exception as e:
        print(f"Error: An error occurred: {e}")
        return {}

# Function to display match-by-match data for a selected team
def show_team_data(team_number=""):
    try:
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, local_file_path)

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file(excel_url, file_path)

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Ensure that the team number is numeric
        if not team_number.isdigit() or int(team_number) == 0:
            print("Invalid Input: Please enter a valid team number.")
            return []

        # Filter the dataframe by the team number
        team_data = df[df['Team Number'] == int(team_number)]

        if team_data.empty:
            print(f"No Results: No match data found for Team {team_number}.")
            return []

        # Get the current configuration
        current_config = config_loader.get_config()
        
        # Columns to include
        include_columns = ['Scouter Name', 'Match Number', 'Team Number']
        include_columns.extend(current_config.get('include_columns', []))

        # Define column mappings
        column_mappings = current_config.get('column_mappings', {})
        
        # Build the list of columns that exist in the dataframe
        valid_columns = []
        for col in include_columns:
            if col in team_data.columns:
                valid_columns.append(col)
            elif col in column_mappings:
                for alt_col in column_mappings[col]:
                    if alt_col in team_data.columns:
                        valid_columns.append(alt_col)
                        break

        # Filter columns based on valid_columns
        team_data_filtered = team_data[valid_columns]

        # Calculate scores for each match
        team_data_filtered['Score'] = team_data_filtered.apply(
            lambda row: calculate_scores(row, current_config.get('scoring_rules', {})), 
            axis=1
        )

        # Convert to list of dicts for API return
        match_data = team_data_filtered.to_dict(orient='records')
        return match_data

    except Exception as e:
        print(f"Error: An error occurred: {e}")
        return []

# Function to calculate and display team rankings
def show_team_rankings():
    try:
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Calculate scores for each match
        df['Score'] = df.apply(calculate_scores, axis=1)

        # Calculate total scores for each team
        team_scores = df.groupby('Team Number')['Score'].sum()

        # Convert the series to a dictionary and sort by team number numerically
        team_rankings = {int(team): score for team, score in team_scores.items() if team != 0}
        sorted_team_rankings = dict(sorted(team_rankings.items(), key=lambda item: item[0]))

        # Return the rankings data
        return sorted_team_rankings

    except Exception as e:
        print(f"Error: An error occurred: {e}")
        return {}

# Define the scoring rules - Now accepts the scoring rules as a parameter
def calculate_scores(row, scoring_rules=None):
    score = 0
    
    # Get the current scoring rules
    if scoring_rules is None:
        scoring_rules = config_loader.get_value('scoring_rules', {})
    
    try:
        # Handle Leave Bonus specially since it's boolean
        if 'Leave Bonus (T/F)' in row and 'Leave Bonus (T/F)' in scoring_rules:
            # Convert to boolean correctly
            leave_bonus = False
            leave_value = row['Leave Bonus (T/F)']
            
            if isinstance(leave_value, bool):
                leave_bonus = leave_value
            elif isinstance(leave_value, str):
                leave_bonus = leave_value.upper() in ('TRUE', 'T', 'YES', 'Y', '1')
            elif isinstance(leave_value, (int, float)):
                leave_bonus = leave_value >= 0.5
                
            if leave_bonus:
                score += scoring_rules['Leave Bonus (T/F)']
        
        # Process all other scoring columns
        for column in scoring_rules:
            # Skip Leave Bonus as we already handled it
            if column == 'Leave Bonus (T/F)':
                continue
                
            # Handle Endgame Barge specially since it's a lookup table
            if column == 'Endgame Barge' and column in row:
                try:
                    # Get the barge value and convert to int for lookup
                    barge_value = row[column]
                    if pd.isna(barge_value):
                        continue
                        
                    if isinstance(barge_value, (int, float)):
                        # Round to nearest integer
                        barge_key = str(round(barge_value))
                        if barge_key in scoring_rules[column]:
                            score += scoring_rules[column][barge_key]
                except (ValueError, TypeError, KeyError) as e:
                    print(f"Error processing Endgame Barge: {e}")
                    continue
            
            # Handle all other numeric columns
            elif column in row and column != 'Endgame Barge':
                try:
                    value = row[column]
                    # Skip NaN values
                    if pd.isna(value):
                        continue
                        
                    # Convert to numeric if needed
                    if isinstance(value, str):
                        try:
                            value = float(value)
                        except (ValueError, TypeError):
                            continue
                            
                    # Apply scoring
                    if isinstance(value, (int, float)):
                        score += value * scoring_rules[column]
                except Exception as e:
                    print(f"Error processing column {column}: {e}")
                    continue
    
    except Exception as e:
        print(f"Error calculating score: {e}")
    
    return score

# Flask Routes
# Authentication middleware
def login_required(func):
    def wrapper(*args, **kwargs):
        # Skip authentication if login is not required
        if not REQUIRE_LOGIN:
            # If login is not required, set a default user session
            if 'user_id' not in session:
                session['user_id'] = 'guest'
                session['user_name'] = 'Guest User'
            return func(*args, **kwargs)

        # Check if user is logged in via session
        if 'user_id' not in session:
            # Check if user is logged in via cookie
            user_token = request.cookies.get('user_token')
            if user_token and '_' in user_token:
                user_id, token = user_token.split('_', 1)
                if user_id in USERS:
                    # Re-establish session
                    session['user_id'] = user_id
                    session['user_name'] = USERS[user_id]['name']
                    session.permanent = True
                else:
                    return redirect(url_for('login'))
            else:
                return redirect(url_for('login'))
        return func(*args, **kwargs)
    # Rename the function to the original function's name
    wrapper.__name__ = func.__name__
    return wrapper

# Login route
@app.route('/login', methods=['GET', 'POST'])
def login():
    # Skip login if not required
    if not REQUIRE_LOGIN:
        session['user_id'] = 'guest'
        session['user_name'] = 'Guest User'
        return redirect(url_for('index'))
        
    error = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        remember = 'remember' in request.form
        
        if username in USERS and USERS[username]['password'] == password:
            session['user_id'] = username
            session['user_name'] = USERS[username]['name']
            session.permanent = True
            
            response = make_response(redirect(url_for('index')))
            
            if remember:
                # Create a token for cookie authentication
                token = f"{username}_{secrets.token_hex(16)}"
                # Set cookie to expire in 30 days - Use datetime instead of dt.datetime
                expires = datetime.now() + timedelta(days=30)
                response.set_cookie('user_token', token, expires=expires, httponly=True)
            
            return response
        else:
            error = 'Invalid credentials. Please try again.'
    
    return render_template('login.html', error=error)

# Logout route
@app.route('/logout')
def logout():
    # Clear session
    session.pop('user_id', None)
    session.pop('user_name', None)
    
    # Create response object to clear cookies
    response = make_response(redirect(url_for('login')))
    response.set_cookie('user_token', '', expires=0)  # Expire the cookie
    
    return response

# Main index route - now protected
@app.route('/')
@login_required
def index():
    return render_template('index.html', user_name=session.get('user_name', 'Guest'))

# Add a new route to get the current configuration
@app.route('/get_config', methods=['GET'])
@login_required
def get_config():
    # Reload configuration in case it was updated
    config_loader.load_config()
    return jsonify(config_loader.get_config())

# Protected API routes - Add login_required decorator to all API routes
@app.route('/get_team_averages', methods=['POST'])
@login_required
def get_team_averages():
    try:
        team_number = request.form['team_number']
        if int(team_number) == 0:
            return jsonify({'error': 'Invalid team number.'}), 400
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
        
        # Print column names to help diagnose issues
        print(f"Excel columns: {df.columns.tolist()}")
        
        # Define mapping between standard column names and alternative column names
        alt_columns = {
            'Auto Coral L2/L3 (#)': ['Auto coral L2', 'Auto Coral L3'],
            'Auto Algae Net (#)': ['Auto Barge Algae'],
            'Auto Algae Processor (#)': ['Auto Processor Algae'],
            'Coral L2/L3 (#)': ['Coral L2', 'Coral L3'],
            'Algae Net (#)': ['Barge Algae'],
            'Algae Processor (#)': ['processor Algae']
        }
        
        # First check if our expected standard columns exist
        standard_columns = []
        for col in GAME_CONFIG['include_columns']:
            if col in df.columns:
                standard_columns.append(col)
        
        # Then check for alternative column names
        alt_mapping = {}  # Maps alternative column names to standard names
        for std_col, alt_cols in alt_columns.items():
            for alt_col in alt_cols:
                if alt_col in df.columns:
                    standard_columns.append(alt_col)
                    alt_mapping[alt_col] = std_col
        
        print(f"Using columns: {standard_columns}")
        
        if not standard_columns:
            return jsonify({'error': 'No valid data columns found in the Excel file'}), 400
        
        # Filter dataframe to only include valid columns + Team Number
        valid_df = df[['Team Number'] + [col for col in standard_columns if col in df.columns]]
        
        # Filter to only include the requested team
        team_data = valid_df[valid_df['Team Number'] == int(team_number)]
        
        if team_data.empty:
            return jsonify({'error': f'No data found for team {team_number}'}), 404
        
        # Calculate averages for each column, but use max for Endgame Barge
        averages = {}
        for col in team_data.columns:
            if col == 'Team Number':
                continue
            
            if col == 'Endgame Barge':
                # For endgame barge, use the maximum value (best climb) not the average
                value = team_data[col].max()
            else:
                # For all other columns, use the average as before
                value = team_data[col].mean()
                
            # Convert NumPy types to native Python types for JSON serialization
            if isinstance(value, np.integer):
                averages[col] = int(value)
            elif isinstance(value, np.floating):
                averages[col] = float(value)
            elif isinstance(value, np.ndarray):
                averages[col] = value.tolist()
            elif pd.isna(value) or (isinstance(value, (int, float)) and np.isinf(value)):
                averages[col] = None
            else:
                averages[col] = value
        
        # Map alternative column names back to standard names
        std_averages = {}
        for col, val in averages.items():
            if col in alt_mapping:
                # Use the standard name for this column
                std_name = alt_mapping[col]
                if std_name in std_averages:
                    # If we already have data for this standard name, average it
                    std_averages[std_name] = (std_averages[std_name] + val) / 2 if val is not None and std_averages[std_name] is not None else (std_averages[std_name] or val)
                else:
                    std_averages[std_name] = val
            else:
                std_averages[col] = val
        
        return jsonify({'team_number': team_number, 'averages': std_averages})
    
    except Exception as e:
        import traceback
        traceback.print_exc()  # Print the full error traceback
        return jsonify({'error': str(e)}), 500

# Add a new endpoint to get all available teams
@app.route('/get_all_teams', methods=['GET'])
@login_required
def get_all_teams():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Get all unique team numbers, excluding 0 and non-numeric values
        team_numbers = []
        for team in df['Team Number'].unique():
            if pd.notna(team) and team != 0:
                try:
                    team_int = int(team)
                    team_numbers.append(team_int)
                except (ValueError, TypeError):
                    # Skip non-numeric values
                    continue

        # Sort team numbers numerically
        team_numbers.sort()

        print(f"Found {len(team_numbers)} teams: {team_numbers[:10]}...")
        return jsonify({'teams': team_numbers})

    except Exception as e:
        import traceback
        traceback.print_exc()  # Print the full error traceback
        return jsonify({'error': f"Error getting teams: {str(e)}"}), 500

@app.route('/get_all_team_averages', methods=['GET'])
@login_required
def get_all_team_averages():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        print(f"Columns in Excel file: {df.columns.tolist()}")  # Debug

        # Use the include_columns from GAME_CONFIG
        include_columns = GAME_CONFIG.get('include_columns', [])
        print(f"Include columns from config: {include_columns}")  # Debug

        # Ensure Team Number is available
        if 'Team Number' not in df.columns:
            return jsonify({'error': 'Team Number column not found in Excel file'}), 500

        # Get valid columns that exist in the dataframe
        valid_columns = [col for col in include_columns if col in df.columns]
        print(f"Valid columns found: {valid_columns}")  # Debug
        
        if not valid_columns:
            # If we have no valid columns from config, use all numeric columns except Team Number and Match Number
            numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
            valid_columns = [col for col in numeric_columns if col not in ['Team Number', 'Match Number']]
            print(f"Using numeric columns instead: {valid_columns}")  # Debug
            
            if not valid_columns:
                return jsonify({'error': 'No valid numeric data columns found in the Excel file'}), 400

        # Create a DataFrame with just Team Number
        result_df = pd.DataFrame({'Team Number': df['Team Number'].unique()})
        result_df = result_df[result_df['Team Number'] != 0]  # Filter out Team 0

        # For each column, calculate the average per team and join back to result_df
        for col in valid_columns:
            try:
                # Convert to numeric, handling errors
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
                # Calculate the average per team, but use max for Endgame Barge
                if col == 'Endgame Barge':
                    avg_df = df.groupby('Team Number')[col].max().reset_index()
                else:
                    avg_df = df.groupby('Team Number')[col].mean().reset_index()
                
                # Join to the result dataframe
                result_df = result_df.merge(avg_df, on='Team Number', how='left')
            except Exception as e:
                print(f"Error processing column {col}: {e}")
                # Skip this column if there's an error

        # Set Team Number as the index
        result_df = result_df.set_index('Team Number')
        
        # Handle NaN values (convert to None for proper JSON serialization)
        result_df = result_df.where(pd.notna(result_df), None)
        
        # Convert to dictionary by team number
        result_dict = {}
        for team in result_df.index:
            if pd.isna(team) or team == 0:
                continue
                
            # Convert NumPy int64 to Python int for the team number key
            team_int = int(team)
                
            team_data = {}
            for col in result_df.columns:
                value = result_df.loc[team, col]
                # Handle special cases for JSON serialization - use numpy instead of pd.isinf
                if pd.isna(value) or (isinstance(value, (int, float)) and np.isinf(value)):
                    team_data[col] = None
                else:
                    # Convert NumPy types to native Python types
                    if isinstance(value, np.integer):
                        team_data[col] = int(value)
                    elif isinstance(value, np.floating):
                        team_data[col] = float(value)
                    elif isinstance(value, np.ndarray):
                        team_data[col] = value.tolist()
                    else:
                        team_data[col] = value
            
            result_dict[team_int] = team_data

        # Return the result as JSON
        return jsonify(result_dict)

    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"Error in get_all_team_averages: {e}")
        print(traceback_str)
        return jsonify({'error': f"Server error: {str(e)}"}), 500

@app.route('/get_all_notes', methods=['GET'])
@login_required
def get_all_notes():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
        
        # Check if the necessary columns exist
        required_columns = ['Team Number', 'Match Number', 'Additional Observations', 'Scouter Name']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        # Look for alternative column names if original ones are missing
        alternative_mappings = {
            'Match Number': ['Match'],
            'Team Number': ['Team'],
            'Additional Observations': ['Notes', 'Comments', 'Observations'],
            'Scouter Name': ['Scouter', 'Name']
        }
        
        column_mapping = {}
        for req_col in missing_columns:
            for alt_col in alternative_mappings.get(req_col, []):
                if alt_col in df.columns:
                    column_mapping[alt_col] = req_col
                    break
        
        # Rename columns if alternatives were found
        if column_mapping:
            df = df.rename(columns=column_mapping)
        
        # Check again after mapping
        still_missing = [col for col in required_columns if col not in df.columns]
        if still_missing:
            return jsonify({'error': f'Required columns missing: {", ".join(still_missing)}'}), 400
        
        # Extract the notes data with team and match numbers
        notes_data = []
        for _, row in df.iterrows():
            # Skip rows with null or empty observations
            if pd.isna(row['Additional Observations']) or str(row['Additional Observations']).strip() == '':
                continue
                
            note = {
                'team_number': int(row['Team Number']) if not pd.isna(row['Team Number']) else None,
                'match_number': int(row['Match Number']) if not pd.isna(row['Match Number']) else None,
                'observation': str(row['Additional Observations']),
                'scouter_name': str(row['Scouter Name']) if not pd.isna(row['Scouter Name']) else 'Unknown'
            }
            notes_data.append(note)
        
        # Return the notes data
        return jsonify(notes_data)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/get_match_data', methods=['GET'])
@login_required
def get_match_data():
    try:
        # Get the team number from the query parameters
        team_number = request.args.get('team_number')
        print(f"Received team number: {team_number}")  # Debugging statement

        # Check if team_number is provided
        if not team_number:
            return jsonify({'error': 'Team number is required.'}), 400

        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')
        print(f"Excel file path: {file_path}")  # Debugging statement

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Check if the Excel file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'The Excel file was not found.'}), 404

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
        print("Excel file read successfully")  # Debugging statement
        print(f"Column names: {df.columns}")  # Debugging statement

        # Ensure that the team number is numeric
        if not team_number.isdigit() or int(team_number) == 0:
            return jsonify({'error': 'Please enter a valid team number.'}), 400

        # Filter the dataframe by the team number
        team_data = df[df['Team Number'] == int(team_number)]
        print(f"Filtered team data: {team_data}")  # Debugging statement

        if team_data.empty:
            return jsonify({'error': f'No match data found for Team {team_number}.'}), 404

        # Define standard columns we want to include based on GAME_CONFIG
        standard_columns = ['Scouter Name', 'Match Number', 'Team Number']
        standard_columns.extend(GAME_CONFIG['include_columns'])
        
        # Define mapping between standard column names and alternative column names
        column_mapping = {
            'Match Number': ['Match'],
            'Scouter Name': ['Name'],
            'Auto Coral L2/L3 (#)': ['Auto Coral L2 (#)', 'Auto Coral L3 (#)'],
            'Auto Algae Net (#)': ['Auto Barge Algae'],
            'Auto Algae Processor (#)': ['Auto Processor Algae'],
            'Coral L2/L3 (#)': ['Coral L2 (#)', 'Coral L3 (#)'],
            'Algae Net (#)': ['Barge Algae'],
            'Algae Processor (#)': ['processor Algae']
        }
        
        # Build list of columns to include, checking for alternative names
        include_columns = []
        for std_col in standard_columns:
            if std_col in team_data.columns:
                include_columns.append(std_col)
            elif std_col in column_mapping:
                for alt_col in column_mapping[std_col]:
                    if alt_col in team_data.columns:
                        include_columns.append(alt_col)
                        break

        # Filter columns based on include_columns that exist
        team_data_filtered = team_data[include_columns].copy()
        print(f"Filtered columns: {team_data_filtered.columns}")  # Debugging statement

        # Calculate scores for each match
        if 'Score' not in team_data_filtered.columns:
            try:
                team_data_filtered['Score'] = team_data_filtered.apply(calculate_scores, axis=1)
                print(f"Calculated scores: {team_data_filtered['Score']}")  # Debugging statement
            except Exception as e:
                print(f"Error calculating scores: {e}")
                # Add a placeholder score if calculation fails
                team_data_filtered['Score'] = float('nan')

        # Convert the dataframe to a list of dictionaries
        match_data = team_data_filtered.to_dict(orient='records')
        print(f"Match data (first record): {match_data[0] if match_data else 'No data'}")  # Debugging statement

        return jsonify(match_data)

    except FileNotFoundError:
        return jsonify({'error': 'The Excel file was not found.'}), 404
    except ValueError as e:
        return jsonify({'error': f'An error occurred while processing the data: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'An unexpected error occurred: {e}'}), 500
    
    
@app.route('/get_team_rankings', methods=['GET'])
@login_required
def get_team_rankings():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Calculate scores for each match
        df['Score'] = df.apply(calculate_scores, axis=1)

        # Calculate total scores for each team
        team_scores = df.groupby('Team Number')['Score'].sum().sort_values(ascending=False)
        team_scores = team_scores[team_scores.index != 0]  # Exclude team 0

        # Convert the series to a dictionary with integer keys
        team_rankings = {int(team): float(score) for team, score in team_scores.items()}

        return jsonify(team_rankings)

    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/get_team_match_counts', methods=['GET'])
@login_required
def get_team_match_counts():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Count matches for each team
        team_counts = df.groupby('Team Number').size().to_dict()
        
        # Convert keys to strings for JSON serialization
        match_counts = {str(int(team)): count for team, count in team_counts.items() if team != 0}
        
        return jsonify(match_counts)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/calculate_match_points', methods=['POST'])
@login_required
def calculate_match_points():
    try:
        red_teams = request.form.getlist('red_teams[]')
        blue_teams = request.form.getlist('blue_teams[]')
        
        # Check for updated configuration in the request
        config_json = request.form.get('config')
        if config_json:
            try:
                # Update the configuration for this request
                local_config = json.loads(config_json)
                scoring_rules = local_config.get('scoring_rules', GAME_CONFIG['scoring_rules'])
            except:
                scoring_rules = GAME_CONFIG['scoring_rules']
        else:
            scoring_rules = GAME_CONFIG['scoring_rules']

        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Use include_columns from the configuration
        include_columns = GAME_CONFIG['include_columns']

        # Ensure columns exist in the dataframe before filtering
        valid_columns = [col for col in include_columns if col in df.columns]
        
        if not valid_columns:
            return jsonify({'error': 'No valid data columns found in the Excel file'})

        df_filtered = df[valid_columns]
        df_filtered = df_filtered.apply(pd.to_numeric, errors='coerce')
        df_filtered['Team Number'] = df['Team Number']

        team_averages = df_filtered.groupby('Team Number').mean()

        def get_team_points(team_number):
            if team_number in team_averages.index and team_number != 0:
                team_data = team_averages.loc[team_number]
                
                # Create breakdown using only columns that exist
                breakdown = {}
                for col in valid_columns:
                    if col in team_data:
                        breakdown[col] = team_data[col]
                
                # Calculate total score using the provided scoring rules
                total = 0
                for col in breakdown:
                    if col in scoring_rules:
                        # Handle special case for Endgame Barge
                        if col == 'Endgame Barge':
                            barge_value = breakdown[col]
                            if isinstance(barge_value, (int, float)):
                                barge_key = str(int(barge_value))
                                if barge_key in scoring_rules['Endgame Barge']:
                                    total += scoring_rules['Endgame Barge'][barge_key]
                        else:
                            if isinstance(breakdown[col], bool) or (isinstance(breakdown[col], (int, float)) and breakdown[col] > 0):
                                total += breakdown[col] * scoring_rules[col]
                
                return {'total': total, 'breakdown': breakdown}
            return {'total': 0, 'breakdown': {}}

        red_alliance_points = sum(get_team_points(int(team))['total'] for team in red_teams if team.isdigit() and int(team) != 0)
        blue_alliance_points = sum(get_team_points(int(team))['total'] for team in blue_teams if team.isdigit() and int(team) != 0)

        team_points = {team: get_team_points(int(team)) for team in red_teams + blue_teams if team.isdigit() and int(team) != 0}

        return jsonify({
            'red_alliance_points': red_alliance_points,
            'blue_alliance_points': blue_alliance_points,
            'team_points': team_points
        })

    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/compare_teams', methods=['POST'])
@login_required
def compare_teams():
    try:
        teams = request.form.getlist('teams[]')
        if not teams:
            return jsonify({'error': 'Please provide at least one team number'})
            
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
        
        # Get team rankings for scoring context
        team_rankings = {}
        df['Score'] = df.apply(calculate_scores, axis=1)
        team_scores = df.groupby('Team Number')['Score'].sum().sort_values(ascending=False)
        team_scores = team_scores[team_scores.index != 0]  # Exclude team 0
        
        for rank, (team, _) in enumerate(team_scores.items(), 1):
            team_rankings[int(team)] = rank
        
        # Get the averages for each team
        result = {}
        for team_str in teams:
            try:
                team = int(team_str)
                if team == 0:
                    continue
                
                # Get team data
                team_data = df[df['Team Number'] == team]
                
                if team_data.empty:
                    result[team_str] = {'error': 'No data found for this team'}
                    continue
                
                # Extract averages for key metrics
                team_result = {}
                
                # Add team number and rank
                team_result['team_number'] = team
                team_result['rank'] = team_rankings.get(team, None)
                
                # Calculate auto score using new column names
                auto_score = 0
                if 'Leave Bonus (T/F)' in team_data.columns:
                    auto_leave = team_data['Leave Bonus (T/F)'].mean()
                    if auto_leave > 0.5:  # If average is more than 0.5, count it as boolean true
                        auto_score += 3  # Points for leaving the start zone
                
                # Add auto scores for game pieces
                auto_score_columns = [
                    'Auto Coral L1 (#)', 'Auto Coral L2/L3 (#)', 'Auto Coral L4 (#)', 
                    'Auto Coral Unclear (#)', 'Auto Algae Net (#)', 'Auto Algae Processor (#)'
                ]
                
                for col in auto_score_columns:
                    if col in team_data.columns and col in GAME_CONFIG['scoring_rules']:
                        auto_score += (team_data[col].mean() or 0) * GAME_CONFIG['scoring_rules'][col]
                
                team_result['auto_score'] = float(auto_score)
                
                # Calculate teleop score using new column names
                teleop_score = 0
                teleop_score_columns = [
                    'Coral L1 (#)', 'Coral L2/L3 (#)', 'Coral L4 (#)', 
                    'Coral Unclear (#)', 'Algae Net (#)', 'Algae Processor (#)'
                ]
                
                for col in teleop_score_columns:
                    if col in team_data.columns and col in GAME_CONFIG['scoring_rules']:
                        teleop_score += (team_data[col].mean() or 0) * GAME_CONFIG['scoring_rules'][col]
                
                # Add endgame barge points
                if 'Endgame Barge' in team_data.columns:
                    avg_barge = team_data['Endgame Barge'].mean() or 0
                    # Round to nearest integer for lookup
                    barge_key = str(int(round(avg_barge)))
                    if barge_key in GAME_CONFIG['scoring_rules']['Endgame Barge']:
                        teleop_score += GAME_CONFIG['scoring_rules']['Endgame Barge'][barge_key]
                
                team_result['teleop_score'] = float(teleop_score)
                
                # Calculate total score
                team_result['total_score'] = team_result['auto_score'] + team_result['teleop_score']
                
                # Calculate defense rating if available
                if 'Defense Performed' in team_data.columns:
                    defense_rating = team_data['Defense Performed'].mean() or 0
                    team_result['defense_rating'] = float(defense_rating)
                
                # Add fouls if available
                if 'Minor Fouls' in team_data.columns:
                    team_result['minor_fouls'] = float(team_data['Minor Fouls'].mean() or 0)
                
                if 'Major Fouls' in team_data.columns:
                    team_result['major_fouls'] = float(team_data['Major Fouls'].mean() or 0)
                
                # Add all the averages from include_columns that exist in the data
                for col in GAME_CONFIG['include_columns']:
                    if col in team_data.columns:
                        team_result[col] = float(team_data[col].mean() or 0)
                
                result[team_str] = team_result
                
            except ValueError:
                result[team_str] = {'error': 'Invalid team number'}
            
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/get_defense_teams', methods=['GET'])
@login_required
def get_defense_teams():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Download the file if it does not exist locally
        if not os.path.exists(file_path):
            download_excel_file('https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB', file_path)

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
            
        # Check if defense metrics exist in the data
        defense_metrics = []
        if 'Defense Performed' in df.columns:
            defense_metrics.append('Defense Performed')
        if 'Defense Quality' in df.columns:
            defense_metrics.append('Defense Quality')
        if 'Defense Time' in df.columns:
            defense_metrics.append('Defense Time')
            
        if not defense_metrics:
            # If no explicit defense columns, create a simpler metric based on breakdowns and fouls
            df['Defense Rating'] = 0
            
            # Teams that break down less frequently might be more reliable for defense
            if 'Broke (T/F)' in df.columns:
                # Lower break rate is better for defense (invert the value)
                df['Defense Rating'] += (1 - df['Broke (T/F)'].fillna(0)) * 2
            
            # Teams with more fouls might be playing more aggressively on defense
            if 'Major Fouls' in df.columns or 'Minor Fouls' in df.columns:
                if 'Major Fouls' in df.columns:
                    # Normalize major fouls to a 0-1 scale for the dataset
                    max_fouls = df['Major Fouls'].max() if df['Major Fouls'].max() > 0 else 1
                    df['Defense Rating'] += df['Major Fouls'].fillna(0) / max_fouls
                
                if 'Minor Fouls' in df.columns:
                    # Normalize minor fouls to a 0-1 scale but with less weight than major fouls
                    max_fouls = df['Minor Fouls'].max() if df['Minor Fouls'].max() > 0 else 1
                    df['Defense Rating'] += (df['Minor Fouls'].fillna(0) / max_fouls) * 0.5
            
            defense_metrics = ['Defense Rating']
        
        # Group by team and calculate defense metrics
        team_defense = df.groupby('Team Number')[defense_metrics].mean().reset_index()
        
        # Process the data to ensure metrics are in proper ranges
        for col in defense_metrics:
            if col == 'Defense Performed':
                # Ensure Defense Performed is in 0-1 range (representing percentage)
                # If values are already large (>1), assume they're incorrectly scaled
                if team_defense[col].max() > 1:
                    # If values appear to be already in percentage (e.g., 65 for 65%)
                    # convert to proper 0-1 scale
                    team_defense[col] = team_defense[col] / 100
                    
                # Cap at 1.0 to ensure percentage is valid
                team_defense[col] = team_defense[col].clip(0, 1)
            
            elif col == 'Defense Quality':
                # Normalize to a 0-5 scale if not already
                if team_defense[col].max() > 5:
                    team_defense[col] = (team_defense[col] / team_defense[col].max()) * 5
        
        # Calculate an overall defense score (weighted average if multiple metrics exist)
        if len(defense_metrics) > 1:
            # Create a weighted average based on metric importance
            weights = {
                'Defense Performed': 0.4,
                'Defense Quality': 0.4,
                'Defense Time': 0.2,
                'Defense Rating': 1.0
            }
            
            team_defense['Overall Defense'] = sum(
                team_defense[metric] * weights.get(metric, 0.3) 
                for metric in defense_metrics
            )
        else:
            # Just use the single metric
            team_defense['Overall Defense'] = team_defense[defense_metrics[0]]
        
        # Sort by defense score (descending)
        team_defense = team_defense.sort_values('Overall Defense', ascending=False)
        
        # Filter out team 0 and any invalid teams
        team_defense = team_defense[team_defense['Team Number'] > 0]
        
        # Convert to a dictionary
        defense_teams = {}
        for _, row in team_defense.iterrows():
            team_number = int(row['Team Number'])
            defense_score = float(row['Overall Defense'])
            
            # Include the component metrics in the result
            metrics = {metric: float(row[metric]) for metric in defense_metrics}
            
            defense_teams[team_number] = {
                'score': defense_score,
                'metrics': metrics
            }
        
        return jsonify(defense_teams)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/save_do_not_pick_list', methods=['POST'])
@login_required
def save_do_not_pick_list():
    try:
        # Get the list from the request
        team_list = request.form.getlist('teams[]')
        
        # Validate that all teams are valid integers
        validated_teams = []
        for team in team_list:
            try:
                team_num = int(team)
                validated_teams.append(team_num)
            except ValueError:
                continue  # Skip invalid team numbers
        
        # Create a JSON string of the teams
        team_json = json.dumps(validated_teams)
        
        # Save to a file
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'do_not_pick.json')
        
        with open(file_path, 'w') as f:
            f.write(team_json)
        
        return jsonify({'success': True, 'message': f'Saved {len(validated_teams)} teams to "Do Not Pick" list'})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/load_do_not_pick_list', methods=['GET'])
@login_required
def load_do_not_pick_list():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'do_not_pick.json')
        
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({'teams': []})
        
        # Load the list from the file
        with open(file_path, 'r') as f:
            team_json = f.read()
        
        team_list = json.loads(team_json)
        
        return jsonify({'teams': team_list})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/save_defense_list', methods=['POST'])
@login_required
def save_defense_list():
    try:
        # Get the list from the request
        teams_json = request.form.get('teams', '[]')
        
        try:
            teams_data = json.loads(teams_json)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid JSON format'}), 400
        
        # Validate the format (should be a list of objects with team and rank)
        if not isinstance(teams_data, list):
            return jsonify({'error': 'Invalid format: not an array'}), 400
        
        # Save to a file
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'defense_list.json')
        
        with open(file_path, 'w') as f:
            f.write(teams_json)
        
        return jsonify({'success': True, 'message': f'Saved {len(teams_data)} teams to Defense list'})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/load_defense_list', methods=['GET'])
@login_required
def load_defense_list():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'defense_list.json')
        
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({'teams': []})
        
        # Load the list from the file
        with open(file_path, 'r') as f:
            team_json = f.read()
        
        team_list = json.loads(team_json)
        
        return jsonify({'teams': team_list})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/save_avoid_list', methods=['POST'])
@login_required
def save_avoid_list():
    try:
        # Get the list from the request
        team_list = request.form.getlist('teams[]')
        
        # Validate that all teams are valid integers
        validated_teams = []
        for team in team_list:
            try:
                team_num = int(team)
                validated_teams.append(team_num)
            except ValueError:
                continue  # Skip invalid team numbers
        
        # Create a JSON string of the teams
        team_json = json.dumps(validated_teams)
        
        # Save to a file
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'avoid_list.json')
        
        with open(file_path, 'w') as f:
            f.write(team_json)
        
        return jsonify({'success': True, 'message': f'Saved {len(validated_teams)} teams to "Avoid" list'})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/load_avoid_list', methods=['GET'])
@login_required
def load_avoid_list():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'avoid_list.json')
        
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({'teams': []})
        
        # Load the list from the file
        with open(file_path, 'r') as f:
            team_json = f.read()
        
        team_list = json.loads(team_json)
        
        return jsonify({'teams': team_list})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/save_alliance_selections', methods=['POST'])
@login_required
def save_alliance_selections():
    try:
        # Get the alliance selections from the request
        selections_json = request.form.get('selections', '{}')
        
        try:
            selections_data = json.loads(selections_json)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid JSON format'}), 400
        
        # Validate the format (should be an object)
        if not isinstance(selections_data, dict):
            return jsonify({'error': 'Invalid format: not an object'}), 400
        
        # Save to a file
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'alliance_selections.json')
        
        # Get the current timestamp
        current_time = time.time()
        
        with open(file_path, 'w') as f:
            f.write(selections_json)
        
        # Log the alliance selection update
        action = "reset" if not selections_data else "update"
        user_id = session.get('user_id', 'unknown')
        print(f"Alliance selections {action} by {user_id} at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        return jsonify({
            'success': True, 
            'message': f'Alliance selections {"reset" if not selections_data else "saved"}',
            'timestamp': current_time
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/load_alliance_selections', methods=['GET'])
@login_required
def load_alliance_selections():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'alliance_selections.json')
        
        # Check if the file exists
        if not os.path.exists(file_path):
            return jsonify({'selections': {}, 'timestamp': 0})
        
        # Load the selections from the file
        with open(file_path, 'r') as f:
            selections_json = f.read()
        
        try:
            selections_data = json.loads(selections_json)
            # Get the file's modification time as timestamp
            file_timestamp = os.path.getmtime(file_path)
            return jsonify({'selections': selections_data, 'timestamp': file_timestamp})
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid JSON in selections file'}), 500
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/auto_scroll_util.js')
def auto_scroll_util():
    js_code = """
// Auto-scroll utility for draggable elements
function enableAutoScroll(options = {}) {
    // Default options
    const defaults = {
        scrollZoneSize: 100,  // Size of the scroll zone in pixels
        maxScrollSpeed: 15,   // Maximum scroll speed in pixels per frame
        scrollContainers: [], // Array of container selectors to apply scrolling to
        defenseListSelector: '.defense-team-list', // Selector for the defense list
        teamItemSelector: '.team-item',  // Selector for team items within the defense list
        adjustDefenseHeight: true,       // Whether to dynamically adjust defense list height
        teamItemHeight: 40,              // Approx height of a team item in pixels
        minDefenseHeight: 100,           // Minimum height for defense list 
        maxDefenseHeight: 800,           // Maximum height for defense list
        heightPadding: 20                // Additional padding for the container height
    };
    
    // Merge options with defaults
    const settings = { ...defaults, ...options };
    
    // Current drag state
    let isDragging = false;
    let draggedElement = null;
    let scrollContainerElements = [];
    let defenseListContainer = null;
    
    // Find all scroll containers
    function initScrollContainers() {
        // ...existing code...
        
        // If adjustDefenseHeight is enabled, set up the defense list height adjustment
        if (settings.adjustDefenseHeight && defenseListContainer) {
            adjustDefenseListHeight();
            
            // Set up a MutationObserver to watch for changes in the defense list
            const observer = new MutationObserver(function(mutations) {
                adjustDefenseListHeight();
            });
            
            // Start observing the defense list for changes in its children
            observer.observe(defenseListContainer, { childList: true, subtree: true });
            
            // Also listen for any custom events that signal team list updates
            document.addEventListener('teamsUpdated', adjustDefenseListHeight);
            document.addEventListener('defenseTeamsLoaded', adjustDefenseListHeight);
        }
    }
    
    // Function to adjust the height of the defense list based on its contents
    function adjustDefenseListHeight() {
        if (!defenseListContainer) return;
        
        // Count the number of team items in the defense list
        const teamItems = defenseListContainer.querySelectorAll(settings.teamItemSelector);
        const teamCount = teamItems.length;
        
        // Calculate the ideal height based on the number of teams
        let idealHeight = teamCount * settings.teamItemHeight + settings.heightPadding;
        
        // Enforce min/max constraints
        idealHeight = Math.max(settings.minDefenseHeight, idealHeight);
        idealHeight = Math.min(settings.maxDefenseHeight, idealHeight);
        
        // If there are very few or no teams, use the minimum height
        if (teamCount <= 2) {
            idealHeight = settings.minDefenseHeight;
        }
        
        // Set the height of the defense list container
        defenseListContainer.style.height = idealHeight + 'px';
        
        // Remove any overflow settings that would cause scrollbars
        defenseListContainer.style.overflow = 'visible';
        
        // If we have a parent with overflow set, make it visible too
        let parent = defenseListContainer.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (style.overflow === 'auto' || style.overflow === 'scroll') {
                // Store original overflow in data attribute if not already stored
                if (!parent.dataset.originalOverflow) {
                    parent.dataset.originalOverflow = style.overflow;
                }
                parent.style.overflow = 'visible';
            }
            parent = parent.parentElement;
        }
        
        // Dispatch an event to notify that the defense list height has been adjusted
        const event = new CustomEvent('defenseHeightAdjusted', { 
            detail: { height: idealHeight, teamCount: teamCount } 
        });
        document.dispatchEvent(event);
    }
    
    // Set up drag event listeners
    function init() {
        initScrollContainers();
        
        // ...existing code...
    }
    
    // The rest of the existing auto-scroll code remains unchanged
    // ...existing code...
    
    // Initialize
    init();
    
    // Return public methods
    return {
        updateContainers: initScrollContainers,
        stop: stopAutoScroll,
        adjustDefenseHeight: adjustDefenseListHeight
    };
}

// Add a utility function to manually trigger defense list height adjustment
function resizeDefenseList() {
    const event = new CustomEvent('teamsUpdated');
    document.dispatchEvent(event);
}
"""
    response = make_response(js_code)
    response.headers['Content-Type'] = 'application/javascript'
    return response

# Function to monitor server system metrics
def get_system_metrics():
    metrics = {}
    
    # CPU metrics
    metrics['cpu_percent'] = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count(logical=True)
    metrics['cpu_count'] = cpu_count
    
    # Memory metrics
    memory = psutil.virtual_memory()
    metrics['memory_total'] = memory.total
    metrics['memory_available'] = memory.available
    metrics['memory_used'] = memory.used
    metrics['memory_percent'] = memory.percent
    
    # Disk metrics
    disk = psutil.disk_usage('/')
    metrics['disk_total'] = disk.total
    metrics['disk_free'] = disk.free
    metrics['disk_used'] = disk.used
    metrics['disk_percent'] = disk.percent
    
    # Network metrics
    net_io = psutil.net_io_counters()
    metrics['net_bytes_sent'] = net_io.bytes_sent
    metrics['net_bytes_recv'] = net_io.bytes_recv
    
    # System information
    metrics['system'] = platform.system()
    metrics['node'] = platform.node()
    metrics['release'] = platform.release()
    metrics['version'] = platform.version()
    metrics['machine'] = platform.machine()
    metrics['processor'] = platform.processor()
    
    # Connected clients info
    with client_lock:
        metrics['client_count'] = len(connected_clients)
        metrics['clients'] = list(connected_clients)
    
    # Add server uptime
    metrics['uptime'] = time.time() - psutil.boot_time()
    
    # Try to get temperature info if available
    try:
        temperatures = psutil.sensors_temperatures()
        if temperatures:
            metrics['temperatures'] = []
            for name, entries in temperatures.items():
                for entry in entries:
                    metrics['temperatures'].append({
                        'name': name,
                        'label': entry.label,
                        'current': entry.current,
                        'high': entry.high if hasattr(entry, 'high') else None,
                        'critical': entry.critical if hasattr(entry, 'critical') else None
                    })
    except:
        metrics['temperatures'] = []
    
    return metrics

# Function to update the server metrics display
def update_server_display():
    try:
        metrics = get_system_metrics()
        
        # Clear the display
        server_info_text.delete(1.0, tk.END)
        
        # Format the metrics nicely
        server_info_text.insert(tk.END, f"SERVER MONITORING DASHBOARD\n", "heading")
        # Use datetime.now() instead of dt.datetime.now()
        server_info_text.insert(tk.END, f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n", "timestamp")
        
        # System information
        server_info_text.insert(tk.END, "SYSTEM INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"Operating System: {metrics['system']} {metrics['release']} ({metrics['version']})\n")
        server_info_text.insert(tk.END, f"Machine: {metrics['machine']}\n")
        server_info_text.insert(tk.END, f"Processor: {metrics['processor']}\n")
        server_info_text.insert(tk.END, f"Hostname: {metrics['node']}\n")
        
        # Format uptime nicely
        uptime_seconds = metrics['uptime']
        days, remainder = divmod(uptime_seconds, 86400)
        hours, remainder = divmod(remainder, 3600)
        minutes, seconds = divmod(remainder, 60)
        uptime_str = f"{int(days)}d {int(hours)}h {int(minutes)}m {int(seconds)}s"
        server_info_text.insert(tk.END, f"Server Uptime: {uptime_str}\n\n")
        
        # CPU information
        server_info_text.insert(tk.END, "CPU INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"CPU Count: {metrics['cpu_count']} logical cores\n")
        server_info_text.insert(tk.END, f"CPU Usage: {metrics['cpu_percent']}%\n\n")
        
        # Memory information
        server_info_text.insert(tk.END, "MEMORY INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"Total Memory: {metrics['memory_total'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Used Memory: {metrics['memory_used'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Free Memory: {metrics['memory_available'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Memory Usage: {metrics['memory_percent']}%\n\n")
        
        # Disk information
        server_info_text.insert(tk.END, "DISK INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"Total Disk: {metrics['disk_total'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Used Disk: {metrics['disk_used'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Free Disk: {metrics['disk_free'] / (1024**3):.2f} GB\n")
        server_info_text.insert(tk.END, f"Disk Usage: {metrics['disk_percent']}%\n\n")
        
        # Network information
        server_info_text.insert(tk.END, "NETWORK INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"Bytes Sent: {metrics['net_bytes_sent'] / (1024**2):.2f} MB\n")
        server_info_text.insert(tk.END, f"Bytes Received: {metrics['net_bytes_recv'] / (1024**2):.2f} MB\n\n")
        
        # Temperature information
        if metrics['temperatures']:
            server_info_text.insert(tk.END, "TEMPERATURE INFORMATION\n", "section_heading")
            for temp in metrics['temperatures']:
                server_info_text.insert(tk.END, f"{temp['name']} - {temp['label']}: {temp['current']}°C\n")
            server_info_text.insert(tk.END, "\n")
        
        # Connected clients
        server_info_text.insert(tk.END, "CLIENT INFORMATION\n", "section_heading")
        server_info_text.insert(tk.END, f"Connected Clients: {metrics['client_count']}\n\n")
        
        if metrics['client_count'] > 0:
            server_info_text.insert(tk.END, "CLIENT LIST:\n", "subsection_heading")
            for i, client in enumerate(metrics['clients'], 1):
                last_seen = last_requests.get(client, "Unknown")
                if isinstance(last_seen, float):
                    seconds_ago = time.time() - last_seen
                    if seconds_ago < 60:
                        last_seen = f"{int(seconds_ago)} seconds ago"
                    elif seconds_ago < 3600:
                        last_seen = f"{int(seconds_ago / 60)} minutes ago"
                    else:
                        last_seen = f"{int(seconds_ago / 3600)} hours ago"
                
                location = client_locations.get(client, "Unknown")
                server_info_text.insert(tk.END, f"{i}. {client} - Last Active: {last_seen} - Location: {location}\n")
        
        # Apply text tags for styling
        server_info_text.tag_configure("heading", font=("Helvetica", 14, "bold"), foreground="blue")
        server_info_text.tag_configure("timestamp", font=("Helvetica", 10, "italic"), foreground="gray")
        server_info_text.tag_configure("section_heading", font=("Helvetica", 11, "bold"), foreground="darkgreen")
        server_info_text.tag_configure("subsection_heading", font=("Helvetica", 10, "bold"))
    
    except Exception as e:
        server_info_text.delete(1.0, tk.END)
        server_info_text.insert(tk.END, f"Error updating server metrics: {str(e)}")
    
    # Schedule the next update
    root.after(5000, update_server_display)  # Update every 5 seconds

# Replace existing Flask request handlers with versions that track clients
@app.before_request
def track_request():
    client_ip = request.remote_addr
    with client_lock:
        connected_clients.add(client_ip)
        last_requests[client_ip] = time.time()
        client_locations[client_ip] = request.headers.get('X-Forwarded-For', 'Local')
    
    # Clean up old clients (not seen in 10 minutes)
    cleanup_threshold = time.time() - 600  # 10 minutes
    stale_clients = []
    with client_lock:
        for client, last_time in list(last_requests.items()):
            if last_time < cleanup_threshold:
                stale_clients.append(client)
        
        for client in stale_clients:
            if client in connected_clients:
                connected_clients.remove(client)
            if client in last_requests:
                del last_requests[client]
            if client in client_locations:
                del client_locations[client]

# New endpoint to log search refresh activities
@app.route('/log_search_refresh', methods=['POST'])
@login_required
def log_search_refresh():
    try:
        message = request.form.get('message', 'Search refresh event')
        user_id = session.get('user_id', 'unknown')
        user_name = session.get('user_name', 'Unknown User')
        client_ip = request.remote_addr
        
        # Format the log message
        log_message = f"SEARCH REFRESH: {message} - User: {user_name} ({user_id}) - IP: {client_ip}"
        
        # Add to server logs array for Tkinter display
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        server_logs.append(f"[{timestamp}] {log_message}")
        
        # Keep server_logs to maximum length
        if len(server_logs) > MAX_LOGS:
            server_logs.pop(0)  # Remove oldest log
        
        # Also print to console for standard logging
        print(log_message)
        
        return jsonify({'success': True})
    except Exception as e:
        error_msg = f"Error logging search refresh: {str(e)}"
        print(error_msg)
        return jsonify({'error': error_msg})

# New route to update configuration from frontend
@app.route('/update_config', methods=['POST'])
@login_required
def update_config():
    global GAME_CONFIG
    
    try:
        config_json = request.form.get('config')
        if not config_json:
            return jsonify({'error': 'No configuration data received'}), 400
        
        # Parse the configuration JSON
        new_config = json.loads(config_json)
        
        # Validate the configuration
        required_keys = ['team_column', 'include_columns', 'exclude_columns', 'scoring_rules']
        missing_keys = [key for key in required_keys if key not in new_config]
        
        if missing_keys:
            return jsonify({
                'error': f'Missing required configuration keys: {", ".join(missing_keys)}'
            }), 400
        
        # Update the configuration with a lock to prevent race conditions
        with config_lock:
            # Update the main configuration keys
            GAME_CONFIG['team_column'] = new_config['team_column']
            GAME_CONFIG['include_columns'] = new_config['include_columns']
            GAME_CONFIG['exclude_columns'] = new_config['exclude_columns']
            GAME_CONFIG['scoring_rules'] = new_config['scoring_rules']
            
            # Update column mappings if present
            if 'column_mappings' in new_config:
                GAME_CONFIG['column_mappings'] = new_config['column_mappings']
            
            # Update server configuration if present
            if 'server' in new_config:
                if 'excel_url' in new_config['server']:
                    GAME_CONFIG['excel_url'] = new_config['server']['excel_url']
                if 'data_refresh_interval' in new_config['server']:
                    GAME_CONFIG['data_refresh_interval'] = new_config['server']['data_refresh_interval']
        
        # Log the configuration update
        print(f"Configuration updated from frontend: {GAME_CONFIG}")
        
        return jsonify({'success': True, 'message': 'Configuration updated successfully'})
    
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON configuration'}), 400
    except KeyError as e:
        return jsonify({'error': f'Invalid configuration structure: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Configuration update error: {str(e)}'}), 500

# Create a global list to store the last 100 log entries (move this up before first use)
server_logs = []
MAX_LOGS = 100

@app.route('/ai_query', methods=['POST'])
@login_required
def ai_query():
    try:
        query = request.form.get('query')
        context = request.form.get('context', '{}')
        
        if not query:
            return jsonify({'error': 'No query provided'}), 400
            
        # Parse the context
        try:
            context_data = json.loads(context)
        except json.JSONDecodeError:
            context_data = {}
        
        # Extract conversation history if available
        conversation_history = context_data.get('conversation_history', [])
        
        # Extract team data from the context
        team_mentions = context_data.get('teamMentions', [])
        
        # Use the imported AI assistant module to process the query
        response_data = ai_assistant.process_ai_query(query, conversation_history, team_mentions)
        
        return jsonify(response_data)
        
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"Error in AI query: {e}")
        print(traceback_str)
        return jsonify({'error': f"Server error: {str(e)}"}), 500

@app.route('/update_ai_mode', methods=['POST'])
@login_required
def update_ai_mode():
    try:
        # Get the battery saving mode setting
        battery_saving = request.form.get('battery_saving', 'true').lower() == 'true'
        
        # Update the configuration
        use_llm = not battery_saving
        
        # First update the in-memory setting in ai_assistant module
        import ai_assistant
        ai_assistant.use_llm = use_llm
        
        # Then update the configuration file for persistence
        config_loader.set_value('use_llm', use_llm, section='ai_assistant')
        config_loader.save_config()
        
        # Log the change
        mode = "Battery Saving Mode" if battery_saving else "Full AI Mode"
        print(f"AI Assistant switched to {mode}")
        
        # Add to server logs
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        server_logs.append(f"[{timestamp}] AI Assistant mode changed: {mode}")
        
        return jsonify({'success': True, 'mode': 'battery_saving' if battery_saving else 'full_ai'})
    
    except Exception as e:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"Error updating AI mode: {e}")
        print(traceback_str)
        return jsonify({'error': f"Server error: {str(e)}"}), 500

def start_flask():
    # Get local IP addresses for easier connection
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        
        # Get port from configuration with a default value
        port = config_loader.get_value('port', 5454, section='server')
        
        # Log server start with IP information
        print(f"\n===== Server Information =====")
        print(f"Server starting on:")
        print(f"* Local address: http://127.0.0.1:{port}")
        print(f"* Network address: http://{local_ip}:{port}")
        print(f"* Hostname: http://{hostname}:{port}")
        print(f"============================\n")
        
        # Add to server logs
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        server_logs.append(f"[{timestamp}] Server started on local address: http://127.0.0.1:{port}")
        server_logs.append(f"[{timestamp}] Server available at network address: http://{local_ip}:{port}")
        
        # Try to get all network interfaces for additional connection options
        try:
            import netifaces
            for interface in netifaces.interfaces():
                # Skip loopback interface
                if interface.startswith('lo'):
                    continue
                    
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    for addr in addrs[netifaces.AF_INET]:
                        ip = addr['addr']
                        if ip != '127.0.0.1':
                            print(f"* Additional network interface: http://{ip}:{port} ({interface})")
                            server_logs.append(f"[{timestamp}] Server available at: http://{ip}:{port} ({interface})")
        except ImportError:
            # netifaces not installed, skip additional interfaces
            pass
        except Exception as e:
            print(f"Error getting additional network interfaces: {str(e)}")
            
    except Exception as e:
        print(f"Error obtaining network information: {str(e)}")
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)

flask_thread = threading.Thread(target=start_flask)
flask_thread.daemon = True
flask_thread.start()

# Create the main window for Tkinter GUI
root = tk.Tk()
root.title("Server Monitoring Dashboard")
root.resizable(True, True)
root.geometry("900x600")  # Set a larger default size

# Create a Notebook widget for tabs
notebook = ttk.Notebook(root)
notebook.pack(pady=10, expand=True, fill=tk.BOTH)

# Create the first tab for server info
server_info_frame = tk.Frame(notebook)
notebook.add(server_info_frame, text="Server Status")

# Create header frame
header_frame = tk.Frame(server_info_frame)
header_frame.pack(pady=10, fill=tk.X)

# Create header label
header_label = tk.Label(header_frame, text="Server Monitoring Dashboard", font=("Helvetica", 16, "bold"))
header_label.pack(side=tk.LEFT, padx=10)

# Create refresh button
refresh_button = tk.Button(header_frame, text="Manual Refresh", command=update_server_display)
refresh_button.pack(side=tk.RIGHT, padx=10)

# Create a Text widget to display the server info
server_info_text = tk.Text(server_info_frame, height=30, width=100)
server_info_text.pack(pady=10, padx=10, expand=True, fill=tk.BOTH)

# Add scrollbar to the Text widget
scrollbar = ttk.Scrollbar(server_info_text, command=server_info_text.yview)
scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
server_info_text.config(yscrollcommand=scrollbar.set)

# Create the second tab for client monitoring
client_frame = tk.Frame(notebook)
notebook.add(client_frame, text="Client Monitoring")

# Create a frame for client stats
client_stats_frame = tk.Frame(client_frame)
client_stats_frame.pack(pady=10, fill=tk.BOTH, expand=True)

# Create labels for client stats
client_count_label = tk.Label(client_stats_frame, text="Total Clients: 0", font=("Helvetica", 14))
client_count_label.pack(anchor=tk.W, padx=20, pady=5)

active_clients_label = tk.Label(client_stats_frame, text="Active Clients: 0", font=("Helvetica", 14))
active_clients_label.pack(anchor=tk.W, padx=20, pady=5)

# Create a listbox for client details
client_list_frame = tk.Frame(client_frame)
client_list_frame.pack(pady=10, padx=20, fill=tk.BOTH, expand=True)

client_list_label = tk.Label(client_list_frame, text="Connected Clients", font=("Helvetica", 12, "bold"))
client_list_label.pack(anchor=tk.W)

client_listbox = tk.Listbox(client_list_frame, height=20, width=80)
client_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

client_scrollbar = ttk.Scrollbar(client_list_frame, command=client_listbox.yview)
client_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
client_listbox.config(yscrollcommand=client_scrollbar.set)

# Function to update the client display
def update_client_display():
    try:
        with client_lock:
            total_clients = len(connected_clients)
            
            # Consider clients active if they've made a request in the last 2 minutes
            active_threshold = time.time() - 120
            active_clients = sum(1 for last_time in last_requests.values() if last_time >= active_threshold)
            
            # Update client count labels
            client_count_label.config(text=f"Total Clients: {total_clients}")
            active_clients_label.config(text=f"Active Clients: {active_clients}")
            
            # Update client listbox
            client_listbox.delete(0, tk.END)
            
            if total_clients > 0:
                # Sort clients by last activity (most recent first)
                sorted_clients = sorted(
                    [(client, last_requests.get(client, 0)) for client in connected_clients],
                    key=lambda x: x[1],
                    reverse=True
                )
                
                for client, last_time in sorted_clients:
                    if isinstance(last_time, float):
                        seconds_ago = time.time() - last_time
                        if seconds_ago < 60:
                            activity = f"Active {int(seconds_ago)} seconds ago"
                        elif seconds_ago < 3600:
                            activity = f"Active {int(seconds_ago / 60)} minutes ago"
                        else:
                            activity = f"Active {int(seconds_ago / 3600)} hours ago"
                    else:
                        activity = "Unknown activity"
                    
                    location = client_locations.get(client, "Unknown")
                    status = "Active" if last_time >= active_threshold else "Inactive"
                    client_listbox.insert(tk.END, f"{client} - {status} - {activity} - Location: {location}")
            else:
                client_listbox.insert(tk.END, "No clients connected")
    
    except Exception as e:
        client_listbox.delete(0, tk.END)
        client_listbox.insert(tk.END, f"Error updating client display: {str(e)}")
    
    # Schedule the next update
    root.after(2000, update_client_display)  # Update every 2 seconds

# Create the third tab for server logs
log_frame = tk.Frame(notebook)
notebook.add(log_frame, text="Server Logs")

# Create a Text widget to display the server logs
log_text = tk.Text(log_frame, height=30, width=100)
log_text.pack(pady=10, padx=10, expand=True, fill=tk.BOTH)

# Add scrollbar to the logs Text widget
log_scrollbar = ttk.Scrollbar(log_text, command=log_text.yview)
log_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
log_text.config(yscrollcommand=log_scrollbar.set)

# Create a global list to store the last 100 log entries
server_logs = []
MAX_LOGS = 100

# Create a custom log handler to capture logs
class TkinterLogHandler:
    def write(self, message):
        if message.strip():
            # Use datetime.now() instead of dt.datetime.now()
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            log_entry = f"[{timestamp}] {message.strip()}"
            
            # Add to our log buffer
            server_logs.append(log_entry)
            if len(server_logs) > MAX_LOGS:
                server_logs.pop(0)  # Remove oldest log
            
            # Schedule log update in the main thread
            root.after(0, update_log_display)
    
    def flush(self):
        pass

# Function to update the log display
def update_log_display():
    log_text.delete(1.0, tk.END)
    for entry in server_logs:
        log_text.insert(tk.END, f"{entry}\n")
    log_text.see(tk.END)  # Scroll to the end

# Set up logging
import sys
sys.stderr = TkinterLogHandler()

# Initialize the server metrics display
update_server_display()

# Initialize the client display
update_client_display()

# Add sample log entries
# Use datetime.now() instead of dt.datetime.now()
server_logs.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Server monitoring started")
server_logs.append(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Listening on port 5454")
update_log_display()

# Run the Tkinter main loop
root.mainloop()

