# DLDScout Application Rewrite Instructions

This document outlines the major changes made to the DLDScout application structure to improve stability, functionality, and configuration flexibility.

## Configuration System

### Key Changes:
- Created a centralized configuration in `config.js` that's shared between frontend and backend
- Implemented a robust `ConfigLoader` class in Python to safely parse JavaScript configuration
- Added fallback parsing methods for config loading (json5, standard json, and ast.literal_eval)
- Implemented real-time config monitoring to detect and reload changes automatically

### Benefits:
- Single source of truth for application configuration
- Easy to update game-specific scoring rules and column mappings
- Resilient parsing that handles JavaScript syntax in Python

## Data Processing Updates

### Key Changes:
- Fixed compatibility issues in pandas data handling
- Added numpy integration for better handling of special values (NaN, inf)
- Updated requirements to specify compatible package versions
- Improved error handling and validation in data processing functions

### Benefits:
- More reliable data processing
- Better error messages for debugging
- Consistent handling of missing or invalid data

## Scoring System Improvements

### Key Changes:
- Centralized scoring rules in the configuration
- Updated `calculateTeamScore()` function in JavaScript to properly use configuration
- Modified `calculate_scores()` function in Python to handle all data types correctly
- Added special handling for boolean values (Leave Bonus) and lookup tables (Endgame Barge)

### Benefits:
- Consistent scoring between frontend and backend
- Easy to modify game-specific scoring values
- Better handling of edge cases in data

## UI Enhancements

### Key Changes:
- Added global search functionality with smart results
- Improved error messages and error handling
- Added contextual info modals for each tab
- Enhanced visualization for team comparison and match strategy

### Benefits:
- Better user experience
- More informative feedback on errors
- Easier to navigate and understand application features

## Backend Server Improvements

### Key Changes:
- Added server monitoring dashboard
- Improved client tracking and session management
- Fixed authentication system and added persistent login
- Added robust error handling for all API endpoints

### Benefits:
- Better visibility into server operation
- Easier troubleshooting
- More reliable user sessions

## Adapting the Configuration for a New Game

When you need to adapt the application for a new FIRST Robotics game or a different scouting schema, follow these steps to update the configuration:

### 1. Analyze the New Data Structure

Before making changes, gather the following information:
- Sample row of scouting data from your spreadsheet
- Column names used in the scouting form
- Which columns contain scoring elements vs. metadata
- How points should be calculated for each scoring element

### 2. Update the `config.js` File

Open `static/js/config.js` and modify the following sections:

#### Game Information
```javascript
"game_name": "New Game Name 20XX",
"team_column": "Team Number", // Name of the column containing team numbers
```

#### Include and Exclude Columns
Update these arrays based on your scouting sheet columns:

```javascript
"include_columns": [
    "Auto Element 1", 
    "Auto Element 2",
    "Teleop Element 1",
    "Endgame Position",
    // Add all columns that contain scoring data or metrics
],
    
"exclude_columns": [
    "Scouter Name", 
    "Match Number",
    "Comments",
    // Add all metadata columns that don't affect scoring
],
```

#### Column Mappings
If your scouting data might have alternative column names, add mappings:

```javascript
"column_mappings": {
    "Match Number": ["Match"],
    "Scouter Name": ["Name", "Scout"],
    "Auto Element 1": ["A-Element1", "Auto-E1"],
    // Map any potential alternate column names
},
```

#### Scoring Rules
Define how each element is scored:

```javascript
"scoring_rules": {
    "Auto Element 1": 5, // Each occurrence is worth 5 points
    "Auto Element 2": 10,
    "Leave Starting Zone": 3, // Boolean true/false worth 3 points
    "Teleop Element 1": 2,
    "Endgame Position": {"0": 0, "1": 5, "2": 10, "3": 15}, // Position lookup table
    "Defense Rating": 0, // Set to 0 if not part of scoring
    "Penalties": -5 // Negative points for penalties
},
```

### 3. Test the Configuration

After updating the configuration:

1. Restart the application server
2. Load a small set of test data
3. Verify that team averages and scoring calculations are correct
4. Check that all columns are displayed properly in tables and charts

### 4. Common Configuration Patterns

#### Boolean Elements
For yes/no elements like "left starting zone":
```javascript
"Leave Starting Zone (T/F)": 3, // 3 points if true
```

#### Lookup Tables
For elements with discrete values like endgame positions:
```javascript
"Endgame Position": {"0": 0, "1": 5, "2": 10, "3": 15},
```

#### Counting Elements
For elements where you count occurrences:
```javascript
"Upper Hub Scored": 4, // Each one worth 4 points
```

#### Non-Scoring Elements
For elements used for analysis but not scoring:
```javascript
"Defense Rating": 0, // Not included in total score
```

#### Penalties
For elements that reduce score:
```javascript
"Penalties": -5, // Each one reduces score by 5
```

## Deployment Instructions

1. Update the following files to match the latest versions:
   - `static/js/config.js` - Game configuration
   - `static/js/data-display.js` - Data display functions
   - `avg.py` - Main server file
   - `config_loader.py` - Configuration loading class
   - `requirements.txt` - Updated dependencies

2. Install required packages:
   ```
   pip install -r requirements.txt
   ```

3. Run the application:
   ```
   python avg.py
   ```

4. Access the web interface at:
   - Local: http://localhost:5454
   - Network: http://[your-ip]:5454

## Troubleshooting Common Issues

- **Issue**: "pd.isinf is not an attribute" error
  **Fix**: Ensure pandas 1.5.3 and numpy 1.24.3 are installed
  
- **Issue**: JSON parsing errors
  **Fix**: Install json5 package and ensure configuration syntax is correct
  
- **Issue**: Scoring calculations incorrect
  **Fix**: Verify scoring_rules in config.js match the game specifications
  
- **Issue**: Missing columns in data display
  **Fix**: Update column_mappings in config.js to match your data format

- **Issue**: Configuration not being loaded properly
  **Fix**: Check the generated config_raw.json and config_processed.json files for syntax errors
