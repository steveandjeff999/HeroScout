from flask import Flask, render_template, request, jsonify
import pandas as pd
import os
import threading
import tkinter as tk
from tkinter import messagebox
from tkinter import ttk

# Initialize Flask app
app = Flask(__name__)

# Function to load and process the data, calculate averages
def calculate_averages():
    try:
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Define the relevant columns: team number is in column 'Team Number'
        team_column = 'Team Number'

        # Columns to exclude
        exclude_columns = ['Time', 'Name', 'Match', 'Drive Team Location', 'Robot Start', 'no show', 'Cage position', 
                           'Auto move', 'Auto Dislodged Algae', 'Dislodged Algae', 'Crossed Field', 'tipped', 'died', 
                           'end position', 'Defended', 'yellow/red card', 'commints']

        # Columns to include
        include_columns = ['Auto time', 'Auto coral L1', 'Auto coral L2', 'Auto Coral L3', 'Auto Coral L4', 
                           'Auto Barge Algae', 'Auto Processor Algae', 'Auto Foul', 'Pickup Location', 'Coral L1', 
                           'Coral L2', 'Coral L3', 'Coral L4', 'Barge Algae', 'processor Algae', 'touched opposing cage', 
                           'Offense', 'Defensive']

        # Automatically select columns to average (include only the specified columns)
        data_columns = [col for col in df.columns if col in include_columns]

        # Get the search query from the entry field
        search_query = search_entry.get().strip()

        # Initialize an empty dictionary to store the averages for each team
        team_averages = {}

        # If a search query is provided, filter by that team number
        if search_query:
            # Ensure that the search query is numeric (team number)
            if not search_query.isdigit():
                messagebox.showwarning("Invalid Input", "Please enter a valid team number.")
                return
            # Filter the dataframe by the team number
            team_data = df[df[team_column] == int(search_query)]

            if team_data.empty:
                messagebox.showinfo("No Results", f"No results found for Team {search_query}.")
                return

            # Calculate the averages for the filtered team data
            averages = team_data[data_columns].mean()
            team_averages[search_query] = averages

        else:
            # Iterate through all unique team numbers and calculate averages
            for team in df[team_column].unique():
                # Filter the rows that match the current team number
                team_data = df[df[team_column] == team]

                # Calculate the average for each of the specified columns
                averages = team_data[data_columns].mean()

                # Store the averages for the current team
                team_averages[team] = averages

        # Display the results in the text widget
        result_text.delete(1.0, tk.END)  # Clear previous results
        for team, averages in team_averages.items():
            result_text.insert(tk.END, f"Team {team} Averages:\n", f"team_{team}")
            result_text.insert(tk.END, str(averages) + "\n\n")

        # Save the results to a new Excel file and immediately close it
        output_file_path = os.path.join(script_dir, 'team_averages.xlsx')
        with pd.ExcelWriter(output_file_path, engine='openpyxl') as writer:
            averages_df = pd.DataFrame(team_averages).T  # Transpose to get teams as rows
            averages_df.to_excel(writer, index_label='Team Number')

        messagebox.showinfo("Success", "Averages calculated and saved successfully.")

    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

# Function to display match-by-match data for a selected team
def show_team_data():
    try:
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Get the team number from the entry field
        team_number = match_search_entry.get().strip()

        # Ensure that the team number is numeric
        if not team_number.isdigit():
            messagebox.showwarning("Invalid Input", "Please enter a valid team number.")
            return

        # Filter the dataframe by the team number
        team_data = df[df['Team Number'] == int(team_number)]

        if team_data.empty:
            messagebox.showinfo("No Results", f"No match data found for Team {team_number}.")
            return

        # Display the match-by-match data in the match_text widget
        match_text.delete(1.0, tk.END)  # Clear previous results
        for index, row in team_data.iterrows():
            match_text.insert(tk.END, f"Match {row['Match']}:\n")
            for col in team_data.columns:
                match_text.insert(tk.END, f"{col}: {row[col]}\n")
            match_text.insert(tk.END, "\n")

    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

# Define the scoring rules
def calculate_scores(row):
    score = 0
    # Autonomous Period Scoring
    score += 3 if row['Auto move'] else 0
    score += 3 * row['Auto coral L1']
    score += 4 * row['Auto coral L2']
    score += 6 * row['Auto Coral L3']
    score += 7 * row['Auto Coral L4']
    score += 6 * row['Auto Processor Algae']
    score += 4 * row['Auto Barge Algae']
    # Tele-Operated Period Scoring
    score += 2 * row['Coral L1']
    score += 3 * row['Coral L2']
    score += 4 * row['Coral L3']
    score += 5 * row['Coral L4']
    score += 6 * row['processor Algae']
    score += 4 * row['Barge Algae']
    # Barge scoring based on end position
    if row['end position'] == 'P':
        score += 2
    elif row['end position'] == 'sc':
        score += 6
    elif row['end position'] == 'dc':
        score += 12
    return score

# Function to calculate and display team rankings
def show_team_rankings():
    try:
        # Get the current script's directory
        script_dir = os.path.dirname(os.path.realpath(__file__))

        # Construct the path to the Excel file
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file and immediately close it
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Calculate scores for each match
        df['Score'] = df.apply(calculate_scores, axis=1)

        # Calculate total scores for each team
        team_scores = df.groupby('Team Number')['Score'].sum().sort_values(ascending=False)

        # Display the rankings in the rank_text widget
        rank_text.delete(1.0, tk.END)  # Clear previous results
        for rank, (team, score) in enumerate(team_scores.items(), start=1):
            rank_text.insert(tk.END, f"Rank {rank}: Team {team} - {score} points\n")

    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_team_averages', methods=['POST'])
def get_team_averages():
    try:
        team_number = request.form['team_number']
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # List of columns to include
        include_columns = [
            'Auto time', 'Auto coral L1', 'Auto coral L2', 'Auto Coral L3', 'Auto Coral L4', 
            'Auto Barge Algae', 'Auto Processor Algae', 'Auto Foul', 'Pickup Location', 'Coral L1', 
            'Coral L2', 'Coral L3', 'Coral L4', 'Barge Algae', 'processor Algae', 'touched opposing cage', 
            'Offense', 'Defensive'
        ]
        
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')
        
        # Filter columns based on include_columns
        df_filtered = df[include_columns]
        
        # Convert the columns to numeric, ignoring errors in case of non-numeric values
        df_filtered = df_filtered.apply(pd.to_numeric, errors='coerce')
        
        # Get team data
        team_data = df_filtered[df['Team Number'] == int(team_number)]
        
        # Calculate averages for the filtered team data
        averages = team_data.mean().to_dict()

        return jsonify({'team_number': team_number, 'averages': averages})
    
    except Exception as e:
        return jsonify({'error': str(e)})
    

@app.route('/get_all_team_averages', methods=['GET'])
def get_all_team_averages():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Columns to include
        include_columns = [
            'Auto time', 'Auto coral L1', 'Auto coral L2', 'Auto Coral L3', 'Auto Coral L4', 
            'Auto Barge Algae', 'Auto Processor Algae', 'Auto Foul', 'Pickup Location', 'Coral L1', 
            'Coral L2', 'Coral L3', 'Coral L4', 'Barge Algae', 'processor Algae', 'touched opposing cage', 
            'Offense', 'Defensive'
        ]

        # Filter columns based on include_columns
        df_filtered = df[include_columns]

        # Convert the columns to numeric, ignoring errors in case of non-numeric values
        df_filtered = df_filtered.apply(pd.to_numeric, errors='coerce')

        # Add team number as a column to group by
        df_filtered['Team Number'] = df['Team Number']

        # Group by 'Team Number' and calculate the average for each team
        team_averages = df_filtered.groupby('Team Number').mean()

        # Convert to a dictionary format for easy JSON response
        team_averages_dict = team_averages.to_dict(orient='index')

        # Prepare the result in a format that groups averages by team
        result = {}
        for team_number, averages in team_averages_dict.items():
            result[f'Team {team_number}'] = averages

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/get_match_data', methods=['GET'])
def get_match_data():
    try:
        # Get the team number from the query parameters
        team_number = request.args.get('team_number')

        # Check if team_number is provided
        if not team_number:
            return jsonify({'error': 'Team number is required.'}), 400

        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Check if the Excel file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'The Excel file was not found.'}), 404

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Ensure that the team number is numeric
        if not team_number.isdigit():
            return jsonify({'error': 'Please enter a valid team number.'}), 400

        # Filter the dataframe by the team number
        team_data = df[df['Team Number'] == int(team_number)]

        if team_data.empty:
            return jsonify({'error': f'No match data found for Team {team_number}.'}), 404

        # Columns to include
        include_columns = [
            'Name', 'Match', 'Auto time', 'Auto coral L1', 'Auto coral L2', 'Auto Coral L3', 'Auto Coral L4', 
            'Auto Barge Algae', 'Auto Processor Algae', 'Auto Foul', 'Pickup Location', 'Coral L1', 
            'Coral L2', 'Coral L3', 'Coral L4', 'Barge Algae', 'processor Algae', 'touched opposing cage', 
            'Offense', 'Defensive', 'end position', 'no show', 'Cage position', 'Auto move', 'Auto Dislodged Algae', 'Dislodged Algae', 'Crossed Field', 'tipped', 'died',
        ]

        # Filter columns based on include_columns
        team_data_filtered = team_data[include_columns]

        # Convert the dataframe to a dictionary
        match_data = team_data_filtered.to_dict(orient='records')

        return jsonify(match_data)

    except FileNotFoundError:
        return jsonify({'error': 'The Excel file was not found.'}), 404
    except ValueError as e:
        return jsonify({'error': f'An error occurred while processing the data: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'An unexpected error occurred: {e}'}), 500
    
    
@app.route('/get_team_rankings', methods=['GET'])
def get_team_rankings():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Calculate scores for each match
        df['Score'] = df.apply(calculate_scores, axis=1)

        # Calculate total scores for each team
        team_scores = df.groupby('Team Number')['Score'].sum().sort_values(ascending=False)  # Sort from most to least points

        # Convert the series to a dictionary
        team_rankings = team_scores.to_dict()

        return jsonify(team_rankings)

    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/get_most_died', methods=['GET'])
def get_most_died():
    try:
        script_dir = os.path.dirname(os.path.realpath(__file__))
        file_path = os.path.join(script_dir, 'qr_codes.xlsx')

        # Read the Excel file
        with pd.ExcelFile(file_path, engine='openpyxl') as xls:
            df = pd.read_excel(xls, sheet_name='Match Data')

        # Filter the dataframe to include only the 'Team Number' and 'died' columns
        df_filtered = df[['Team Number', 'died']]
        print("Original 'died' column values:\n", df_filtered['died'].head())  # Debugging statement

        # Explicitly convert 'died' column to boolean based on specific values
        df_filtered['died'] = df_filtered['died'].apply(lambda x: True if str(x).lower() == 'true' else False)
        print("Converted 'died' column to boolean:\n", df_filtered.head())  # Debugging statement

        # Filter the dataframe to include only rows where 'died' is True
        df_died_true = df_filtered[df_filtered['died'] == True]
        print("Filtered DataFrame with 'died' == True:\n", df_died_true.head())  # Debugging statement

        # Count the number of 'true' values in the 'died' column for each team
        died_counts = df_died_true.groupby('Team Number').size().sort_values(ascending=False)
        print("Died Counts:\n", died_counts)  # Debugging statement

        # Convert the series to a list of dictionaries
        result = [{'team': int(team), 'count': int(count)} for team, count in died_counts.items()]

        print("Result:\n", result)  # Debugging statement
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)})

def start_flask():
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)

flask_thread = threading.Thread(target=start_flask)
flask_thread.start()

# Create the main window for Tkinter GUI
root = tk.Tk()
root.title("Team Average Calculator")
root.resizable(True, True)

# Create a Notebook widget for tabs
notebook = ttk.Notebook(root)
notebook.pack(pady=10, expand=True)

# Create the first tab for calculating averages
frame1 = tk.Frame(notebook)
notebook.add(frame1, text="Calculate Averages")

# Create a frame for the search bar and button in the first tab
frame1_inner = tk.Frame(frame1)
frame1_inner.pack(pady=10)

# Create a Label for the search bar
search_label = tk.Label(frame1_inner, text="Enter Team Number:")
search_label.pack(side=tk.LEFT, padx=5)

# Create a search entry widget (text box)
search_entry = tk.Entry(frame1_inner)
search_entry.pack(side=tk.LEFT, padx=5)

# Create a Search button to trigger the filtering
search_button = tk.Button(frame1_inner, text="Search", command=calculate_averages)
search_button.pack(side=tk.LEFT)

# Create a Refresh button to trigger the calculation without filtering
refresh_button = tk.Button(frame1_inner, text="Refresh Averages", command=calculate_averages)
refresh_button.pack(side=tk.LEFT, padx=10)

# Create a Text widget to display the results
result_text = tk.Text(frame1, height=20, width=80)
result_text.pack(pady=10, expand=True, fill=tk.BOTH)

# Create the second tab for displaying match data
frame2 = tk.Frame(notebook)
notebook.add(frame2, text="Match Data")

# Create a frame for the search bar and button in the second tab
frame2_inner = tk.Frame(frame2)
frame2_inner.pack(pady=10)

# Create a Label for the search bar
match_search_label = tk.Label(frame2_inner, text="Enter Team Number:")
match_search_label.pack(side=tk.LEFT, padx=5)

# Create a search entry widget (text box)
match_search_entry = tk.Entry(frame2_inner)
match_search_entry.pack(side=tk.LEFT, padx=5)

# Create a Search button to trigger the filtering
match_search_button = tk.Button(frame2_inner, text="Search", command=show_team_data)
match_search_button.pack(side=tk.LEFT)

# Create a Text widget to display the results
match_text = tk.Text(frame2, height=20, width=80)
match_text.pack(pady=10, expand=True, fill=tk.BOTH)

# Create the third tab for team rankings
frame3 = tk.Frame(notebook)
notebook.add(frame3, text="Team Rankings")

# Create a button to calculate team rankings
rank_button = tk.Button(frame3, text="Show Team Rankings", command=show_team_rankings)
rank_button.pack(pady=10)

# Create a Text widget to display the rankings
rank_text = tk.Text(frame3, height=20, width=80)
rank_text.pack(pady=10, expand=True, fill=tk.BOTH)

# Run the Tkinter main loop
root.mainloop()
