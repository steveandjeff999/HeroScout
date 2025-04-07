// Global configuration for the scouting application
const GAME_CONFIG = {
    // Game information
    "game_name": "Reefscape 2025",
    "team_column": "Team Number",
    
    // Columns to include in calculations and displays
    "include_columns": [
        "Leave Bonus (T/F)", 
        "Auto Coral L1 (#)", 
        "Auto Coral L2/L3 (#)",
        "Auto Coral L4 (#)", 
        "Auto Coral Unclear (#)", 
        "Auto Algae Net (#)", 
        "Auto Algae Processor (#)", 
        "Coral L1 (#)", 
        "Coral L2/L3 (#)", 
        "Coral L4 (#)", 
        "Coral Unclear (#)", 
        "Algae Net (#)", 
        "Algae Processor (#)",
        "Defense Performed", 
        "Endgame Barge", 
        "Minor Fouls", 
        "Major Fouls",
        "Overall Performance"
    ],
    
    // Columns to exclude from calculations
    "exclude_columns": [
        "Scouter Name", 
        "Match Number", 
        "Drive Team Location", 
        "Starting Location", 
        "Additional Observations"
    ],
    
    // Column name mappings for handling alternative column names
    "column_mappings": {
        "Match Number": ["Match"],
        "Scouter Name": ["Name"],
        "Auto Coral L2/L3 (#)": ["Auto L2", "Auto Coral L2", "Auto L3", "Auto Coral L3"],
        "Auto Algae Net (#)": ["Auto Barge Algae"],
        "Auto Algae Processor (#)": ["Auto Processor Algae"],
        "Coral L2/L3 (#)": ["L2", "Teleop Coral L2", "L3", "Teleop Coral L3"],
        "Algae Net (#)": ["Barge Algae"],
        "Algae Processor (#)": ["processor Algae"]
    },
    
    // Scoring rules for calculating team performance metrics
    "scoring_rules": {
        "Leave Bonus (T/F)": 3,
        "Auto Coral L1 (#)": 3,
        "Auto Coral L2/L3 (#)": 4.5,
        "Auto Coral L4 (#)": 7,
        "Auto Coral Unclear (#)": 4,
        "Auto Algae Net (#)": 4,
        "Auto Algae Processor (#)": 6,
        "Coral L1 (#)": 2,
        "Coral L2/L3 (#)": 3.5,
        "Coral L4 (#)": 5,
        "Coral Unclear (#)": 3,
        "Algae Net (#)": 4,
        "Algae Processor (#)": 6,
        "Endgame Barge": {"0": 0, "1": 2, "2": 6, "3": 12},
        "Minor Fouls": -2,
        "Major Fouls": -5
    },
    
    // Chart configuration
    "chart_colors": [
        "#4285F4", "#EA4335", "#FBBC05", "#34A853", "#7065A2",
        "#FF6D01", "#00A4EF", "#F25022", "#7FBA00", "#8BC34A",
        "#03A9F4", "#FF5722", "#9C27B0", "#673AB7", "#3F51B5",
        "#2196F3", "#00BCD4", "#009688", "#4CAF50", "#CDDC39",
        "#FFEB3B", "#FFC107", "#FF9800", "#795548", "#9E9E9E"
    ],
    
    // Alliance configurations
    "alliance_config": {
        "red": {
            "color": "danger",
            "text_color": "white",
            "bg_color": "#dc3545"
        },
        "blue": {
            "color": "primary",
            "text_color": "white",
            "bg_color": "#007bff"
        }
    },
    
    // Server configuration
    "server": {
        "port": 5454,
        "scanner_device": false,
        "data_refresh_interval": 150,
        "excel_url": "https://1drv.ms/x/c/92449be8533c48f9/EdGR3Dz4EB5IlugK2iPoh7oBJuQd2jAF86NhnzLz2cLNVQ?e=xLYwEB",
        "require_login": true,
        "local_file_path": "qr_codes.xlsx"
    },

    // User credentials (only used if require_login is true)
    "users": {
        "5454": {"password": "5568", "name": "5454"},
        "Seth Herod": {"password": "2010", "name": "Seth Herod"}
    }
};

// Export configuration if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GAME_CONFIG };
}

// Define chart colors array for use in charts.js
const CHART_COLORS = GAME_CONFIG.chart_colors;

// Function to get chart title based on metric
function getChartTitle() {
    const metric = $('#chart_metric').val();
    switch(metric) {
        case 'total_score':
            return 'Total Score Comparison';
        case 'auto_score':
            return 'Auto Score Comparison';
        case 'teleop_score':
            return 'Teleop Score Comparison';
        case 'defense_rating':
            return 'Defense Performance Rating';
        case 'broke_rate':
            return 'Robot Failure Rate';
        case 'tipped_rate':
            return 'Robot Tipping Rate';
        default:
            return 'Team Performance Comparison';
    }
}

// Helper function to handle backwards compatibility for combined L2/L3 columns
function handleLegacyData(data) {
    if (data) {
        const processTeam = (teamData) => {
            if ('Auto Coral L2/L3 (#)' in teamData && 
                !('Auto Coral L2 (#)' in teamData) && 
                !('Auto Coral L3 (#)' in teamData)) {
                const combinedValue = teamData['Auto Coral L2/L3 (#)'];
                teamData['Auto Coral L2 (#)'] = combinedValue / 2;
                teamData['Auto Coral L3 (#)'] = combinedValue / 2;
            }
            
            if ('Coral L2/L3 (#)' in teamData && 
                !('Coral L2 (#)' in teamData) && 
                !('Coral L3 (#)' in teamData)) {
                const combinedValue = teamData['Coral L2/L3 (#)'];
                teamData['Coral L2 (#)'] = combinedValue / 2;
                teamData['Coral L3 (#)'] = combinedValue / 2;
            }
            
            return teamData;
        };
        
        if (Array.isArray(data)) {
            return data.map(processTeam);
        } else if (typeof data === 'object') {
            if (data.team_points) {
                const processedTeamPoints = {};
                for (const teamNum in data.team_points) {
                    processedTeamPoints[teamNum] = processTeam(data.team_points[teamNum]);
                }
                data.team_points = processedTeamPoints;
                return data;
            } else {
                const processed = {};
                for (const key in data) {
                    processed[key] = processTeam(data[key]);
                }
                return processed;
            }
        }
    }
    
    return data;
}
