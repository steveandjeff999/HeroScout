// Functions for displaying data in various formats

// Display general data in the specified format
function displayData(data, format, target, keyName = 'Team Number') {
    // Check for error response
    if (data && data.error) {
        $(target).html('<div class="alert alert-danger">Error: ' + data.error + '</div>');
        return;
    }
    
    // Check if data is empty or invalid
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        $(target).html('<div class="alert alert-warning">No data available</div>');
        return;
    }
    
    // Special handling for match data - it's an array with match data
    const isMatchData = target === '#match_result' && Array.isArray(data);
    
    // Special handling for match estimation data
    const isMatchEstimation = target === '#match_points_result';
    
    // Format team numbers by removing decimal points
    const formattedData = {};
    
    // If it's not match data and not an array, we can format the data
    if (!isMatchData && !Array.isArray(data)) {
        Object.keys(data).forEach(key => {
            // Handle team numbers with decimal points (e.g., "1234.0")
            const cleanKey = String(key).includes('.') ? String(key).split('.')[0] : String(key);
            formattedData[cleanKey] = data[key];
        });
    } else {
        // For arrays, just use the original data
        Object.assign(formattedData, data);
    }
    
    if (format === 'table') {
        var table = '<table class="table table-dark table-striped"><thead><tr>';
        
        // Check if the data is team rankings (direct value or object structure)
        const isTeamRankings = target === '#rank_result';
        
        // Special handling for match data - preserve the exact Match number
        if (isMatchData) {
            // For match data, get all unique keys to create table headers
            const allKeys = new Set();
            data.forEach(item => {
                Object.keys(item).forEach(key => allKeys.add(key));
            });
            
            // Remove unwanted columns if this is match data
            const columnsToRemove = ['Additional Observations'];
            columnsToRemove.forEach(col => allKeys.delete(col));
            
            // Create headers with important columns first
            const priorityColumns = ['Match Number', 'Match', 'Team Number', 'Score'];
            priorityColumns.forEach(col => {
                if (allKeys.has(col)) {
                    table += `<th>${col}</th>`;
                    allKeys.delete(col);
                }
            });
            
            // Add remaining headers alphabetically
            Array.from(allKeys).sort().forEach(key => {
                table += `<th>${key}</th>`;
            });
            
            table += '</tr></thead><tbody>';
            
            // Add each row of data
            data.forEach(item => {
                table += '<tr>';
                
                // Add priority columns first
                priorityColumns.forEach(col => {
                    if (col in item) {
                        const value = item[col] === true ? 'Yes' : 
                                    item[col] === false ? 'No' : 
                                    item[col];
                        table += `<td>${value}</td>`;
                    }
                });
                
                // Add remaining columns in alphabetical order
                Array.from(allKeys).sort().forEach(key => {
                    const value = item[key] === true ? 'Yes' : 
                              item[key] === false ? 'No' : 
                              item[key];
                    table += `<td>${value}</td>`;
                });
                
                table += '</tr>';
            });
        }
        else if (isTeamRankings) {
            // For team rankings with direct values
            table += `<th>${keyName}</th><th>Points</th><th>Rank</th></tr></thead><tbody>`;
            
            // Get all teams and sort based on the selected sort option
            const sortOption = $('#rank_sort_option').val();
            let teams = Object.keys(formattedData);
            
            switch(sortOption) {
                case 'rank':
                    teams.sort((a, b) => formattedData[b] - formattedData[a]);
                    break;
                case 'rank_asc':
                    teams.sort((a, b) => formattedData[a] - formattedData[b]);
                    break;
                case 'team':
                    teams.sort((a, b) => parseInt(a) - parseInt(b));
                    break;
                case 'team_desc':
                    teams.sort((a, b) => parseInt(b) - parseInt(a));
                    break;
            }
            
            // Add each team with its rank
            teams.forEach((team, index) => {
                const rank = sortOption.startsWith('rank') ? index + 1 : 
                          teams.length - index; // Invert rank for ascending sort
                
                table += `<tr><td>${team}</td><td>${formattedData[team].toFixed(1)}</td><td>${rank}</td></tr>`;
            });
        }
        else if (isMatchEstimation) {
            // Special handling for match estimation data
            table += '<th>Alliance/Team</th><th>Points</th><th>Details</th></tr></thead><tbody>';
            
            // Add Red and Blue alliance rows first with darker background colors
            const redConfig = GAME_CONFIG.alliance_config.red;
            const blueConfig = GAME_CONFIG.alliance_config.blue;
            
            if (formattedData['red_alliance_points'] !== undefined) {
                // Safely parse and format the value with a fallback
                const redPoints = parseFloat(formattedData['red_alliance_points']);
                const formattedRedPoints = !isNaN(redPoints) ? redPoints.toFixed(1) : '0.0';
                
                table += `<tr class="bg-${redConfig.color} text-${redConfig.text_color}">
                    <td><strong>Red Alliance</strong></td>
                    <td><strong>${formattedRedPoints}</strong></td>
                    <td>Total projected points</td>
                </tr>`;
            }
            
            if (formattedData['blue_alliance_points'] !== undefined) {
                // Safely parse and format the value with a fallback
                const bluePoints = parseFloat(formattedData['blue_alliance_points']);
                const formattedBluePoints = !isNaN(bluePoints) ? bluePoints.toFixed(1) : '0.0';
                
                table += `<tr class="bg-${blueConfig.color} text-${blueConfig.text_color}">
                    <td><strong>Blue Alliance</strong></td>
                    <td><strong>${formattedBluePoints}</strong></td>
                    <td>Total projected points</td>
                </tr>`;
            }
            
            // Add spacer row
            table += `<tr><td colspan="3" style="height: 10px;"></td></tr>`;
            
            // Process team-specific data with proper error checking
            if (formattedData['team_points']) {
                // First, gather and process the teams
                const teamPoints = formattedData['team_points'];
                const redTeams = [];
                const blueTeams = [];
                const unknownTeams = [];
                
                Object.keys(teamPoints).forEach(team => {
                    const teamData = teamPoints[team];
                    if (!teamData) return;
                    
                    const alliance = teamData.alliance || 'unknown';
                    
                    // Get total points - try different possible locations
                    let totalPoints = 0;
                    
                    if (teamData.total !== undefined) {
                        totalPoints = parseFloat(teamData.total);
                    } else if (teamData.total_points !== undefined) {
                        totalPoints = parseFloat(teamData.total_points);
                    } else if (teamData.breakdown && Object.keys(teamData.breakdown).length > 0) {
                        // If neither total nor total_points exists, try to sum up from the breakdown
                        totalPoints = Object.values(teamData.breakdown).reduce((sum, val) => {
                            if (typeof val === 'number') return sum + val;
                            return sum;
                        }, 0);
                    }
                    
                    const teamInfo = {
                        team,
                        alliance,
                        totalPoints: isNaN(totalPoints) ? 0 : totalPoints
                    };
                    
                    if (alliance === 'red') {
                        redTeams.push(teamInfo);
                    } else if (alliance === 'blue') {
                        blueTeams.push(teamInfo);
                    } else {
                        unknownTeams.push(teamInfo);
                    }
                });
                
                // Sort teams by team number
                const sortTeams = arr => arr.sort((a, b) => parseInt(a.team) - parseInt(b.team));
                const sortedRedTeams = sortTeams(redTeams);
                const sortedBlueTeams = sortTeams(blueTeams);
                const sortedUnknownTeams = sortTeams(unknownTeams);
                
                // Function to render team rows
                const renderTeamRow = (team, allianceConfig) => {
                    return `<tr class="bg-${allianceConfig.color} text-${allianceConfig.text_color}">
                        <td>Team ${team.team}</td>
                        <td>${team.totalPoints.toFixed(1)}</td>
                        <td>${team.alliance.charAt(0).toUpperCase() + team.alliance.slice(1)} Alliance</td>
                    </tr>`;
                };
                
                // Add red teams
                if (sortedRedTeams.length > 0) {
                    table += `<tr class="bg-dark text-white"><td colspan="3"><strong>Red Alliance Teams</strong></td></tr>`;
                    sortedRedTeams.forEach(team => {
                        table += renderTeamRow(team, redConfig);
                    });
                }
                
                // Add spacer if needed
                if (sortedRedTeams.length > 0 && sortedBlueTeams.length > 0) {
                    table += `<tr><td colspan="3" style="height: 5px;"></td></tr>`;
                }
                
                // Add blue teams
                if (sortedBlueTeams.length > 0) {
                    table += `<tr class="bg-dark text-white"><td colspan="3"><strong>Blue Alliance Teams</strong></td></tr>`;
                    sortedBlueTeams.forEach(team => {
                        table += renderTeamRow(team, blueConfig);
                    });
                }
                
                // Add unknown teams
                if (sortedUnknownTeams.length > 0) {
                    if (sortedRedTeams.length > 0 || sortedBlueTeams.length > 0) {
                        table += `<tr><td colspan="3" style="height: 5px;"></td></tr>`;
                    }
                    table += `<tr class="bg-dark text-white"><td colspan="3"><strong>Unknown Alliance Teams</strong></td></tr>`;
                    sortedUnknownTeams.forEach(team => {
                        table += renderTeamRow(team, {color: 'secondary', text_color: 'white'});
                    });
                }
            }
        }
        else {
            // Regular data - get all column names from all objects
            const allColumns = new Set();
            Object.values(formattedData).forEach(item => {
                if (typeof item === 'object' && item !== null) {
                    Object.keys(item).forEach(key => allColumns.add(key));
                }
            });
            
            // Add Team Number column first
            table += `<th>${keyName}</th>`;
            
            // Add other columns alphabetically
            Array.from(allColumns).sort().forEach(column => {
                table += `<th>${column}</th>`;
            });
            
            table += '</tr></thead><tbody>';
            
            // Add each team's data
            Object.keys(formattedData).forEach(key => {
                table += `<tr><td>${key}</td>`;
                
                if (typeof formattedData[key] === 'object' && formattedData[key] !== null) {
                    Array.from(allColumns).sort().forEach(column => {
                        let value = formattedData[key][column];
                        
                        // Format boolean values as Yes/No
                        if (value === true) value = 'Yes';
                        else if (value === false) value = 'No';
                        
                        // Format numbers to 2 decimal places
                        else if (typeof value === 'number') value = value.toFixed(2);
                        
                        table += `<td>${value !== undefined ? value : ''}</td>`;
                    });
                } else {
                    // Direct value (e.g., team rankings)
                    table += `<td>${formattedData[key]}</td>`;
                }
                
                table += '</tr>';
            });
        }
        
        table += '</tbody></table>';
        $(target).html(table);
        
        // Store the original HTML for filtering operations
        $(target).data('original-html', table);
    } 
    else if (format === 'list') {
        let list = '<ul class="list-group">';
        
        if (isMatchData) {
            // For match data, create a list item for each match
            data.forEach(item => {
                const matchNum = item['Match Number'] || item['Match'] || 'Unknown';
                const score = item['Score'] !== undefined ? `Score: ${item['Score'].toFixed(1)}` : '';
                
                list += `<li class="list-group-item bg-dark text-white">Match ${matchNum} ${score}<ul>`;
                
                // Add all properties
                Object.keys(item).sort().forEach(key => {
                    if (key !== 'Match Number' && key !== 'Match') {
                        const value = item[key] === true ? 'Yes' : 
                                    item[key] === false ? 'No' : 
                                    item[key];
                        list += `<li><strong>${key}:</strong> ${value}</li>`;
                    }
                });
                
                list += '</ul></li>';
            });
        } else if (isMatchEstimation) {
            // Special handling for match estimation in list format with darker colors
            const redConfig = GAME_CONFIG.alliance_config.red;
            const blueConfig = GAME_CONFIG.alliance_config.blue;
            
            // Add alliance data first with darker backgrounds
            if (formattedData['red_alliance_points'] !== undefined) {
                // Safely parse and format the value with a fallback
                const redPoints = parseFloat(formattedData['red_alliance_points']);
                const formattedRedPoints = !isNaN(redPoints) ? redPoints.toFixed(1) : '0.0';
                
                list += `<li class="list-group-item bg-${redConfig.color} text-${redConfig.text_color}"><strong>Red Alliance: ${formattedRedPoints} points</strong></li>`;
            }
            
            if (formattedData['blue_alliance_points'] !== undefined) {
                // Safely parse and format the value with a fallback
                const bluePoints = parseFloat(formattedData['blue_alliance_points']);
                const formattedBluePoints = !isNaN(bluePoints) ? bluePoints.toFixed(1) : '0.0';
                
                list += `<li class="list-group-item bg-${blueConfig.color} text-${blueConfig.text_color}"><strong>Blue Alliance: ${formattedBluePoints} points</strong></li>`;
            }
            
            // Process team-specific data with proper grouping by alliance
            if (formattedData['team_points']) {
                const teamPoints = formattedData['team_points'];
                const redTeams = [];
                const blueTeams = [];
                const unknownTeams = [];
                
                Object.keys(teamPoints).forEach(team => {
                    const teamData = teamPoints[team];
                    if (!teamData) return;
                    
                    const alliance = teamData.alliance || 'unknown';
                    
                    // Get total points - try different possible locations
                    let totalPoints = 0;
                    
                    if (teamData.total !== undefined) {
                        totalPoints = parseFloat(teamData.total);
                    } else if (teamData.total_points !== undefined) {
                        totalPoints = parseFloat(teamData.total_points);
                    } else if (teamData.breakdown && Object.keys(teamData.breakdown).length > 0) {
                        // If neither total nor total_points exists, try to sum up from the breakdown
                        totalPoints = Object.values(teamData.breakdown).reduce((sum, val) => {
                            if (typeof val === 'number') return sum + val;
                            return sum;
                        }, 0);
                    }
                    
                    const teamInfo = {
                        team,
                        alliance,
                        totalPoints: isNaN(totalPoints) ? 0 : totalPoints
                    };
                    
                    if (alliance === 'red') {
                        redTeams.push(teamInfo);
                    } else if (alliance === 'blue') {
                        blueTeams.push(teamInfo);
                    } else {
                        unknownTeams.push(teamInfo);
                    }
                });
                
                // Sort teams by team number
                const sortTeams = arr => arr.sort((a, b) => parseInt(a.team) - parseInt(b.team));
                const sortedRedTeams = sortTeams(redTeams);
                const sortedBlueTeams = sortTeams(blueTeams);
                const sortedUnknownTeams = sortTeams(unknownTeams);
                
                // Helper function to render team items
                const renderTeamItem = (team, allianceConfig, allianceName) => {
                    return `<li class="list-group-item bg-${allianceConfig.color} text-${allianceConfig.text_color}">
                        <strong>Team ${team.team} - ${team.totalPoints.toFixed(1)} points (${allianceName} Alliance)</strong>
                    </li>`;
                };
                
                list += `<li class="list-group-item bg-dark text-white"><strong>Team Breakdown:</strong></li>`;
                
                // Add red teams
                if (sortedRedTeams.length > 0) {
                    sortedRedTeams.forEach(team => {
                        list += renderTeamItem(team, redConfig, 'Red');
                    });
                }
                
                // Add blue teams
                if (sortedBlueTeams.length > 0) {
                    sortedBlueTeams.forEach(team => {
                        list += renderTeamItem(team, blueConfig, 'Blue');
                    });
                }
                
                // Add unknown teams
                if (sortedUnknownTeams.length > 0) {
                    sortedUnknownTeams.forEach(team => {
                        list += renderTeamItem(team, {color: 'secondary', text_color: 'white'}, 'Unknown');
                    });
                }
            }
        } else {
            // For other data, create a list item for each team/key
            Object.keys(formattedData).forEach(key => {
                list += `<li class="list-group-item bg-dark text-white">${keyName}: ${key}<ul>`;
                
                if (typeof formattedData[key] === 'object' && formattedData[key] !== null) {
                    // For objects, show each property
                    Object.keys(formattedData[key]).sort().forEach(prop => {
                        let value = formattedData[key][prop];
                        
                        // Format boolean values as Yes/No
                        if (value === true) value = 'Yes';
                        else if (value === false) value = 'No';
                        
                        // Format numbers to 2 decimal places
                        else if (typeof value === 'number') value = value.toFixed(2);
                        
                        list += `<li><strong>${prop}:</strong> ${value}</li>`;
                    });
                } else {
                    // For direct values (e.g., team rankings)
                    list += `<li><strong>Value:</strong> ${formattedData[key]}</li>`;
                }
                
                list += '</ul></li>';
            });
        }
        
        list += '</ul>';
        $(target).html(list);
        
        // Store the original HTML for filtering operations
        $(target).data('original-html', list);
    } 
    else {
        // JSON format (default)
        try {
            // Store the original HTML for search filtering
            const originalHtml = `<pre>${JSON.stringify(isMatchData ? data : formattedData, null, 4)}</pre>`;
            $(target).data('original-html', originalHtml);
            $(target).html(originalHtml);
        } catch (error) {
            console.error("Error displaying JSON:", error);
            $(target).html(`<div class="alert alert-danger">Error displaying data: ${error.message}</div>`);
        }
    }
    
    // Apply current search filter if it exists
    const searchTerm = $('#enhanced-search').val().trim();
    if (searchTerm) {
        setTimeout(() => filterEnhancedSearchResults(searchTerm), 300);
    }
}

// Display team rankings
function displayTeamRankings(rankingsArray, format) {
    // Assign ranks to teams based on points (before sorting by other criteria)
    const rankedTeams = [...rankingsArray].sort((a, b) => b.points - a.points);
    
    // Add rank property to each team object
    rankedTeams.forEach((team, index) => {
        team.rank = index + 1;
    });
    
    // Now the original rankingsArray elements will have the rank property
    
    if (format === 'table') {
        var table = '<table class="table table-dark table-striped"><thead><tr>';
        table += '<th>Team Number</th><th>Points</th><th>Rank</th></tr></thead><tbody>';
        
        rankingsArray.forEach(function(item) {
            table += `<tr><td>${item.team}</td><td>${item.points.toFixed(1)}</td><td>${item.rank}</td></tr>`;
        });
        
        table += '</tbody></table>';
        $('#rank_result').html(table);
    } else if (format === 'list') {
        var list = '<ul class="list-group">';
        
        rankingsArray.forEach(function(item) {
            list += `<li class="list-group-item bg-dark text-white">Team ${item.team} - ${item.points.toFixed(1)} points (Rank: ${item.rank})</li>`;
        });
        
        list += '</ul>';
        $('#rank_result').html(list);
    } else {
        // JSON format1 (default)
        $('#rank_result').html('<pre>' + JSON.stringify(rankingsArray, null, 2) + '</pre>');
    }
    
    // Apply current search filter if it exists
    const searchTerm = $('#enhanced-search').val().trim();
    if (searchTerm) {
        setTimeout(() => filterEnhancedSearchResults(searchTerm), 300);
    }
}

// Display comparison data for teams
function displayComparisonData(data, format) {
    if (format === 'json') {
        $('#compare_result').html('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
    } else {
        // Table format - get all unique metrics across teams
        const allMetrics = new Set();
        Object.values(data).forEach(teamData => {
            if (teamData && !teamData.error) {
                Object.keys(teamData).forEach(metric => allMetrics.add(metric));
            }
        });
        
        // Remove metrics we don't want to show in comparison
        const excludeMetrics = ['team_number', 'error'];
        excludeMetrics.forEach(metric => allMetrics.delete(metric));
        
        // Convert to array and sort
        const metrics = Array.from(allMetrics).sort();
        
        // Create the comparison table
        let table = '<table class="table table-dark table-striped"><thead><tr>';
        table += '<th>Metric</th>';
        
        // Add team numbers as headers
        const teamNumbers = Object.keys(data).filter(team => !data[team].error);
        teamNumbers.forEach(team => {
            table += `<th>Team ${team}</th>`;
        });
        
        table += '</tr></thead><tbody>';
        
        // Add rows for each metric
        metrics.forEach(metric => {
            table += `<tr><td>${metric}</td>`;
            
            // Find min and max values for this metric across teams (for highlighting)
            let values = teamNumbers.map(team => {
                return data[team][metric] !== undefined ? parseFloat(data[team][metric]) : NaN;
            }).filter(val => !isNaN(val));
            
            const min = Math.min(...values);
            const max = Math.max(...values);
            
            // Add cells for each team's metric
            teamNumbers.forEach(team => {
                const value = data[team][metric];
                let displayValue = value;
                let cellClass = '';
                
                if (value !== undefined) {
                    // Format value based on type
                    if (typeof value === 'boolean') {
                        displayValue = value ? 'Yes' : 'No';
                    } else if (typeof value === 'number') {
                        displayValue = value.toFixed(2);
                        
                        // Add highlighting for highest/lowest/middle values
                        if (values.length > 1) {
                            if (value === max && max !== min) {
                                cellClass = 'bg-success text-white'; // Darker green for best value
                            } else if (value === min && max !== min) {
                                cellClass = 'bg-danger text-white'; // Darker red for worst value
                            } else if (max !== min) {
                                cellClass = 'bg-warning text-dark'; // Yellow for middle values
                            }
                        }
                    }
                } else {
                    displayValue = 'N/A';
                }
                
                table += `<td class="${cellClass}">${displayValue}</td>`;
            });
            
            table += '</tr>';
        });
        
        table += '</tbody></table>';
        $('#compare_result').html(table);
    }
}

// Display positioning data for a team
function displayPositioningData(teamNumber, matchData, averages, format) {
    if (!matchData || matchData.length === 0) {
        $('#positioning_result').html('<div class="alert alert-warning">No match data found for this team.</div>');
        return;
    }
    
    // Calculate positioning statistics
    const stats = calculatePositioningStats(matchData);
    
    // Include average data if available
    if (averages) {
        stats.averages = averages;
    }
    
    // Display based on the selected format
    if (format === 'visual') {
        displayVisualPositioning(teamNumber, stats);
    } else if (format === 'table') {
        displayTablePositioning(teamNumber, stats);
    } else {
        // JSON format
        $('#positioning_result').html('<pre>' + JSON.stringify(stats, null, 2) + '</pre>');
    }
}

// Display positioning data in visual format
function displayVisualPositioning(teamNumber, stats) {
    let html = `
        <div class="positioning-visual">
            <h4 class="text-center mb-4">Team ${teamNumber} Positioning Analysis</h4>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="card bg-dark mb-4">
                        <div class="card-header bg-primary">
                            <h5 class="mb-0">Endgame Barge Position</h5>
                        </div>
                        <div class="card-body text-center">
                            <div class="display-4 mb-2">
                                ${stats.endgameBarge.averageValue.toFixed(2)}
                            </div>
                            <p class="mb-1">Most common: ${stats.endgameBarge.mostCommonName} (${stats.endgameBarge.mostCommon})</p>
                            <div class="progress mt-3 mb-2">
                                <div class="progress-bar" role="progressbar" style="width: ${stats.endgameBarge.noClimb * 100 / stats.matchCount}%;" title="No Climb: ${stats.endgameBarge.noClimb} matches">No Climb</div>
                                <div class="progress-bar bg-info" role="progressbar" style="width: ${stats.endgameBarge.parked * 100 / stats.matchCount}%;" title="Parked: ${stats.endgameBarge.parked} matches">Parked</div>
                                <div class="progress-bar bg-success" role="progressbar" style="width: ${stats.endgameBarge.shallowClimb * 100 / stats.matchCount}%;" title="Shallow Climb: ${stats.endgameBarge.shallowClimb} matches">Shallow</div>
                                <div class="progress-bar bg-warning" role="progressbar" style="width: ${stats.endgameBarge.deepClimb * 100 / stats.matchCount}%;" title="Deep Climb: ${stats.endgameBarge.deepClimb} matches">Deep</div>
                            </div>
                            <div class="row text-center mt-3">
                                <div class="col-3">
                                    <div class="h5">${stats.endgameBarge.noClimb}</div>
                                    <small>No Climb</small>
                                </div>
                                <div class="col-3">
                                    <div class="h5">${stats.endgameBarge.parked}</div>
                                    <small>Parked (1)</small>
                                </div>
                                <div class="col-3">
                                    <div class="h5">${stats.endgameBarge.shallowClimb}</div>
                                    <small>Shallow (2)</small>
                                </div>
                                <div class="col-3">
                                    <div class="h5">${stats.endgameBarge.deepClimb}</div>
                                    <small>Deep (3)</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="card bg-dark mb-4">
                        <div class="card-header bg-success">
                            <h5 class="mb-0">Leave Bonus Success</h5>
                        </div>
                        <div class="card-body text-center">
                            <div class="display-4 mb-3">${stats.leaveBonus.successRate.toFixed(1)}%</div>
                            <div class="progress mb-2">
                                <div class="progress-bar bg-success" role="progressbar" style="width: ${stats.leaveBonus.successRate}%;" 
                                    aria-valuenow="${stats.leaveBonus.successRate}" aria-valuemin="0" aria-valuemax="100">
                                    ${stats.leaveBonus.successRate.toFixed(0)}%
                                </div>
                            </div>
                            <div class="row text-center mt-3">
                                <div class="col-6">
                                    <div class="h5">${stats.leaveBonus.succeeded}</div>
                                    <small>Succeeded</small>
                                </div>
                                <div class="col-6">
                                    <div class="h5">${stats.leaveBonus.failed}</div>
                                    <small>Failed</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="card bg-dark mb-4">
                        <div class="card-header bg-info">
                            <h5 class="mb-0">Auto Algae Scoring</h5>
                        </div>
                        <div class="card-body">
                            <table class="table table-dark table-sm">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Avg/Match</th>
                                        <th>Total</th>
                                        <th>Matches</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Net</td>
                                        <td>${stats.autoAlgae.net.average.toFixed(2)}</td>
                                        <td>${stats.autoAlgae.net.total}</td>
                                        <td>${stats.autoAlgae.net.matches} (${(stats.autoAlgae.net.matches * 100 / stats.matchCount).toFixed(0)}%)</td>
                                    </tr>
                                    <tr>
                                        <td>Processor</td>
                                        <td>${stats.autoAlgae.processor.average.toFixed(2)}</td>
                                        <td>${stats.autoAlgae.processor.total}</td>
                                        <td>${stats.autoAlgae.processor.matches} (${(stats.autoAlgae.processor.matches * 100 / stats.matchCount).toFixed(0)}%)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <div class="card bg-dark mb-4">
                        <div class="card-header bg-warning">
                            <h5 class="mb-0">Teleop Algae Scoring</h5>
                        </div>
                        <div class="card-body">
                            <table class="table table-dark table-sm">
                                <thead>
                                    <tr>
                                        <th>Location</th>
                                        <th>Avg/Match</th>
                                        <th>Total</th>
                                        <th>Matches</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Net</td>
                                        <td>${stats.teleopAlgae.net.average.toFixed(2)}</td>
                                        <td>${stats.teleopAlgae.net.total}</td>
                                        <td>${stats.teleopAlgae.net.matches} (${(stats.teleopAlgae.net.matches * 100 / stats.matchCount).toFixed(0)}%)</td>
                                    </tr>
                                    <tr>
                                        <td>Processor</td>
                                        <td>${stats.teleopAlgae.processor.average.toFixed(2)}</td>
                                        <td>${stats.teleopAlgae.processor.total}</td>
                                        <td>${stats.teleopAlgae.processor.matches} (${(stats.teleopAlgae.processor.matches * 100 / stats.matchCount).toFixed(0)}%)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card bg-dark">
                <div class="card-header bg-secondary">
                    <h5 class="mb-0">Match-by-Match Breakdown</h5>
                </div>
                <div class="card-body" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-dark table-sm">
                        <thead>
                            <tr>
                                <th>Match</th>
                                <th>Endgame</th>
                                <th>Leave Bonus</th>
                                <th>Auto Algae (Net)</th>
                                <th>Auto Algae (Proc)</th>
                                <th>Teleop Algae (Net)</th>
                                <th>Teleop Algae (Proc)</th>
                            </tr>
                        </thead>
                        <tbody>`;
                        
    stats.matchDetails.forEach(match => {
        html += `
            <tr>
                <td>${match.match}</td>
                <td>${getBargeName(match.endgameBarge)}</td>
                <td>${match.leaveBonus ? 'Yes' : 'No'}</td>
                <td>${match.autoAlgaeNet}</td>
                <td>${match.autoAlgaeProcessor}</td>
                <td>${match.teleopAlgaeNet}</td>
                <td>${match.teleopAlgaeProcessor}</td>
            </tr>
        `;
    });
                        
    html += `            </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    $('#positioning_result').html(html);
}

// Display positioning data in table format
function displayTablePositioning(teamNumber, stats) {
    let html = `
        <h4>Team ${teamNumber} Positioning Analysis</h4>
        <table class="table table-dark table-striped">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td rowspan="6">Endgame Barge Position</td>
                    <td>Average Value</td>
                    <td>${stats.endgameBarge.averageValue.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Most Common</td>
                    <td>${stats.endgameBarge.mostCommonName} (${stats.endgameBarge.mostCommon})</td>
                </tr>
                <tr>
                    <td>None (0)</td>
                    <td>${stats.endgameBarge.noClimb} matches (${(stats.endgameBarge.noClimb * 100 / stats.matchCount).toFixed(0)}%)</td>
                </tr>
                <tr>
                    <td>Parked (1)</td>
                    <td>${stats.endgameBarge.parked} matches (${(stats.endgameBarge.parked * 100 / stats.matchCount).toFixed(0)}%)</td>
                </tr>
                <tr>
                    <td>Shallow Climb (2)</td>
                    <td>${stats.endgameBarge.shallowClimb} matches (${(stats.endgameBarge.shallowClimb * 100 / stats.matchCount).toFixed(0)}%)</td>
                </tr>
                <tr>
                    <td>Deep Climb (3)</td>
                    <td>${stats.endgameBarge.deepClimb} matches (${(stats.endgameBarge.deepClimb * 100 / stats.matchCount).toFixed(0)}%)</td>
                </tr>
                
                <tr>
                    <td rowspan="3">Leave Bonus</td>
                    <td>Success Rate</td>
                    <td>${stats.leaveBonus.successRate.toFixed(1)}%</td>
                </tr>
                <tr>
                    <td>Succeeded</td>
                    <td>${stats.leaveBonus.succeeded} matches</td>
                </tr>
                <tr>
                    <td>Failed</td>
                    <td>${stats.leaveBonus.failed} matches</td>
                </tr>
                
                <tr>
                    <td rowspan="2">Auto Algae (Net)</td>
                    <td>Average per Match</td>
                    <td>${stats.autoAlgae.net.average.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Total Scored</td>
                    <td>${stats.autoAlgae.net.total} in ${stats.autoAlgae.net.matches} matches</td>
                </tr>
                
                <tr>
                    <td rowspan="2">Auto Algae (Processor)</td>
                    <td>Average per Match</td>
                    <td>${stats.autoAlgae.processor.average.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Total Scored</td>
                    <td>${stats.autoAlgae.processor.total} in ${stats.autoAlgae.processor.matches} matches</td>
                </tr>
                
                <tr>
                    <td rowspan="2">Teleop Algae (Net)</td>
                    <td>Average per Match</td>
                    <td>${stats.teleopAlgae.net.average.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Total Scored</td>
                    <td>${stats.teleopAlgae.net.total} in ${stats.teleopAlgae.net.matches} matches</td>
                </tr>
                
                <tr>
                    <td rowspan="2">Teleop Algae (Processor)</td>
                    <td>Average per Match</td>
                    <td>${stats.teleopAlgae.processor.average.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Total Scored</td>
                    <td>${stats.teleopAlgae.processor.total} in ${stats.teleopAlgae.processor.matches} matches</td>
                </tr>
            </tbody>
        </table>
    `;
    
    $('#positioning_result').html(html);
}

// Calculate positioning statistics from match data
function calculatePositioningStats(matchData) {
    const stats = {
        matchCount: matchData.length,
        endgameBarge: {
            parked: 0,
            shallowClimb: 0,
            deepClimb: 0,
            noClimb: 0,
            mostCommon: null,
            averageValue: 0,
            successRate: 0
        },
        leaveBonus: {
            succeeded: 0,
            failed: 0,
            successRate: 0
        },
        autoAlgae: {
            net: {
                matches: 0,
                total: 0,
                average: 0
            },
            processor: {
                matches: 0,
                total: 0,
                average: 0
            }
        },
        teleopAlgae: {
            net: {
                matches: 0,
                total: 0,
                average: 0
            },
            processor: {
                matches: 0,
                total: 0,
                average: 0
            }
        },
        matchDetails: []
    };

    // Process each match
    matchData.forEach(match => {
        // Get match number
        const matchNum = match['Match Number'] || match['Match'] || 'Unknown';
        
        // Get endgame barge position
        const bargePos = parseInt(match['Endgame Barge'] || 0);
        if (bargePos === 1) stats.endgameBarge.parked++;
        else if (bargePos === 2) stats.endgameBarge.shallowClimb++;
        else if (bargePos === 3) stats.endgameBarge.deepClimb++;
        else stats.endgameBarge.noClimb++;
        
        // Get leave bonus
        const leaveBonus = match['Leave Bonus (T/F)'] === true || 
                        match['Leave Bonus (T/F)'] === 'TRUE' || 
                        match['Leave Bonus (T/F)'] === 'true' || 
                        match['Leave Bonus (T/F)'] === 1;
                        
        if (leaveBonus) stats.leaveBonus.succeeded++;
        else stats.leaveBonus.failed++;
        
        // Get algae scoring
        const autoAlgaeNet = parseInt(match['Auto Algae Net (#)'] || match['Auto Barge Algae'] || 0);
        const autoAlgaeProcessor = parseInt(match['Auto Algae Processor (#)'] || match['Auto Processor Algae'] || 0);
        const teleopAlgaeNet = parseInt(match['Algae Net (#)'] || match['Barge Algae'] || 0);
        const teleopAlgaeProcessor = parseInt(match['Algae Processor (#)'] || match['processor Algae'] || 0);
        
        // Update auto algae stats
        if (autoAlgaeNet > 0) {
            stats.autoAlgae.net.matches++;
            stats.autoAlgae.net.total += autoAlgaeNet;
        }
        
        if (autoAlgaeProcessor > 0) {
            stats.autoAlgae.processor.matches++;
            stats.autoAlgae.processor.total += autoAlgaeProcessor;
        }
        
        // Update teleop algae stats
        if (teleopAlgaeNet > 0) {
            stats.teleopAlgae.net.matches++;
            stats.teleopAlgae.net.total += teleopAlgaeNet;
        }
        
        if (teleopAlgaeProcessor > 0) {
            stats.teleopAlgae.processor.matches++;
            stats.teleopAlgae.processor.total += teleopAlgaeProcessor;
        }
        
        // Add match detail
        stats.matchDetails.push({
            match: matchNum,
            endgameBarge: bargePos,
            leaveBonus: leaveBonus,
            autoAlgaeNet: autoAlgaeNet,
            autoAlgaeProcessor: autoAlgaeProcessor,
            teleopAlgaeNet: teleopAlgaeNet,
            teleopAlgaeProcessor: teleopAlgaeProcessor
        });
    });

    // Calculate averages and percentages
    stats.endgameBarge.averageValue = 
        (stats.endgameBarge.parked * 1 + 
         stats.endgameBarge.shallowClimb * 2 + 
         stats.endgameBarge.deepClimb * 3) / 
        (stats.endgameBarge.parked + stats.endgameBarge.shallowClimb + stats.endgameBarge.deepClimb + stats.endgameBarge.noClimb);
    
    stats.endgameBarge.successRate = 
        (stats.endgameBarge.parked + stats.endgameBarge.shallowClimb + stats.endgameBarge.deepClimb) * 100 / stats.matchCount;
    
    const bargeValues = [
        { name: 'No Climb', count: stats.endgameBarge.noClimb, value: 0 },
        { name: 'Parked', count: stats.endgameBarge.parked, value: 1 },
        { name: 'Shallow Climb', count: stats.endgameBarge.shallowClimb, value: 2 },
        { name: 'Deep Climb', count: stats.endgameBarge.deepClimb, value: 3 }
    ];
    
    // Find most common barge position
    let maxCount = -1;
    for (let pos of bargeValues) {
        if (pos.count > maxCount) {
            maxCount = pos.count;
            stats.endgameBarge.mostCommon = pos.count;
            stats.endgameBarge.mostCommonName = pos.name;
        }
    }
    
    stats.leaveBonus.successRate = (stats.leaveBonus.succeeded * 100) / stats.matchCount;
    
    // Calculate algae averages
    stats.autoAlgae.net.average = stats.autoAlgae.net.total / stats.matchCount;
    stats.autoAlgae.processor.average = stats.autoAlgae.processor.total / stats.matchCount;
    stats.teleopAlgae.net.average = stats.teleopAlgae.net.total / stats.matchCount;
    stats.teleopAlgae.processor.average = stats.teleopAlgae.processor.total / stats.matchCount;
    
    return stats;
}

// Display strategy analysis 
function displayStrategyAnalysis(redAlliance, blueAlliance) {
    let html = `
        <div class="strategy-analysis">
            <div class="row">
                <div class="col-md-6">
                    <div class="card bg-danger text-white mb-4">
                        <div class="card-header">
                            <h4 class="mb-0">Red Alliance (${Math.round(redAlliance.totalPoints)} pts)</h4>
                        </div>
                        <div class="card-body bg-dark text-white">
                            ${generateAllianceHtml(redAlliance, 'danger')}
                        </div>
                        <div class="card-footer bg-danger">
                            <h5 class="mb-0">Total Projected Points: ${Math.round(redAlliance.totalPoints)}</h5>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card bg-primary text-white mb-4">
                        <div class="card-header">
                            <h4 class="mb-0">Blue Alliance (${Math.round(blueAlliance.totalPoints)} pts)</h4>
                        </div>
                        <div class="card-body bg-dark text-white">
                            ${generateAllianceHtml(blueAlliance, 'primary')}
                        </div>
                        <div class="card-footer bg-primary">
                            <h5 class="mb-0">Total Projected Points: ${Math.round(blueAlliance.totalPoints)}</h5>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card bg-dark text-white">
                <div class="card-header bg-secondary">
                    <h4 class="mb-0">Strategic Analysis</h4>
                </div>
                <div class="card-body">
                    ${generateStrategyRecommendations(redAlliance, blueAlliance)}
                </div>
            </div>
        </div>
    `;
    
    $('#strategy_result').html(html);
}

// Generate HTML for an alliance
function generateAllianceHtml(alliance, colorClass) {
    if (!alliance || alliance.teams.length === 0) {
        return '<div class="alert alert-secondary">No teams selected</div>';
    }
    
    // Sort teams by total points (highest first)
    const sortedTeams = [...alliance.teams].sort((a, b) => b.totalPoints - a.totalPoints);
    
    let html = `
        <div class="alliance-breakdown">
            <div class="row mb-3">
                <div class="col-md-4">
                    <h6>Auto: ${Math.round(alliance.autoPoints)} pts</h6>
                </div>
                <div class="col-md-4">
                    <h6>Teleop: ${Math.round(alliance.teleopPoints)} pts</h6>
                </div>
                <div class="col-md-4">
                    <h6>Total: ${Math.round(alliance.totalPoints)} pts</h6>
                </div>
            </div>
            
            <h6>Teams:</h6>
            <div class="team-list">
    `;
    
    // Add each team
    sortedTeams.forEach(team => {
        html += `
            <div class="team-item mb-2 p-2 border-${colorClass}" style="border-left: 4px solid;">
                <div class="row">
                    <div class="col-md-3">
                        <strong>Team ${team.teamNumber}</strong>
                    </div>
                    <div class="col-md-9">
                        <div class="row">
                            <div class="col-md-4">
                                <small>Auto: ${Math.round(team.autoScore)} pts</small>
                            </div>
                            <div class="col-md-4">
                                <small>Teleop: ${Math.round(team.teleopScore)} pts</small>
                            </div>
                            <div class="col-md-4">
                                <small>Total: ${Math.round(team.totalPoints)} pts</small>
                            </div>
                        </div>
                        <div class="team-details mt-1">
                            <span class="badge badge-secondary mr-1">${team.climbCapability}</span>
                            ${team.leaveBonus ? '<span class="badge badge-success">Leave Bonus</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// Generate strategy recommendations based on alliance comparison
function generateStrategyRecommendations(redAlliance, blueAlliance) {
    if (redAlliance.teams.length === 0 || blueAlliance.teams.length === 0) {
        return '<div class="alert alert-warning">Please select teams for both alliances to generate strategic recommendations.</div>';
    }
    
    let html = '';
    const pointDifference = Math.abs(redAlliance.totalPoints - blueAlliance.totalPoints);
    const favoredAlliance = redAlliance.totalPoints > blueAlliance.totalPoints ? 'Red' : 'Blue';
    
    // Overall match prediction with dark background
    html += `<div class="alert ${pointDifference < 10 ? 'alert-warning' : (favoredAlliance === 'Red' ? 'alert-danger' : 'alert-primary')} bg-dark">
        <h5 class="text-white">Match Prediction</h5>
        <p class="text-white">${pointDifference < 10 ? 'Close match expected' : `${favoredAlliance} alliance favored`} 
        (projected difference: ${Math.round(pointDifference)} points)</p>
    </div>`;
    
    // Add detailed team-by-team analysis before the recommendations
    html += '<div class="row mb-4">';
    html += '<div class="col-md-6">';
    html += generateAllianceTeamDetails(redAlliance, 'Red');
    html += '</div>';
    html += '<div class="col-md-6">';
    html += generateAllianceTeamDetails(blueAlliance, 'Blue');
    html += '</div>';
    html += '</div>';
    
    // Generate specific recommendations for each alliance
    html += '<div class="row">';
    html += '<div class="col-md-6">';
    html += generateAllianceRecommendations(redAlliance, 'Red', blueAlliance);
    html += '</div>';
    html += '<div class="col-md-6">';
    html += generateAllianceRecommendations(blueAlliance, 'Blue', redAlliance);
    html += '</div>';
    html += '</div>';
    
    return html;
}

// Generate detailed team-by-team analysis for an alliance
function generateAllianceTeamDetails(alliance, allianceName) {
    const bgClass = allianceName === 'Red' ? 'bg-danger' : 'bg-primary';
    const textClass = 'text-white';
    
    let html = `<div class="card ${bgClass} ${textClass} mb-3">`;
    html += `<div class="card-header"><h5 class="mb-0">${allianceName} Alliance Team Details</h5></div>`;
    html += `<div class="card-body">`;
    
    if (alliance.teams.length === 0) {
        html += '<p>No teams selected for this alliance.</p>';
    } else {
        // Add each team's details
        alliance.teams.forEach(team => {
            html += `<div class="team-detail-card mb-3 p-2 bg-dark rounded">`;
            html += `<h6 class="border-bottom pb-2 mb-2">Team ${team.teamNumber} (${team.totalPoints.toFixed(1)} pts)</h6>`;
            
            // Create a details table
            html += `<table class="table table-sm table-dark mb-0">
                <tbody>
                    <tr>
                        <td width="50%"><strong>Auto Score:</strong></td>
                        <td>${team.autoScore.toFixed(1)} pts</td>
                    </tr>
                    <tr>
                        <td><strong>Teleop Score:</strong></td>
                        <td>${team.teleopScore.toFixed(1)} pts</td>
                    </tr>
                    <tr>
                        <td><strong>Leave Bonus:</strong></td>
                        <td>${team.leaveBonus ? '<span class="text-success">Yes</span>' : '<span class="text-danger">No</span>'}</td>
                    </tr>
                    <tr>
                        <td><strong>Endgame:</strong></td>
                        <td><span class="${getClimbColorClass(team.climbCapability)}">${team.climbCapability}</span></td>
                    </tr>
                </tbody>
            </table>`;
            html += `</div>`;
        });
    }
    
    html += `</div>`;
    html += `<div class="card-footer d-flex justify-content-between">
        <span>Total Points: <strong>${alliance.totalPoints.toFixed(1)}</strong></span>
        <span>Auto: ${alliance.autoPoints.toFixed(1)} | Teleop: ${alliance.teleopPoints.toFixed(1)}</span>
    </div>`;
    html += `</div>`;
    
    return html;
}

// Helper function to get color class based on climb capability
function getClimbColorClass(climbCapability) {
    switch(climbCapability) {
        case 'Deep Climb':
            return 'text-success';
        case 'Shallow Climb':
            return 'text-warning';
        case 'Parked':
            return 'text-info';
        default:
            return 'text-muted';
    }
}

function generateAllianceRecommendations(alliance, allianceName, opposingAlliance) {
    let html = `<div class="card mb-3 ${allianceName === 'Red' ? 'border-danger' : 'border-primary'} bg-dark">
        <div class="card-header ${allianceName === 'Red' ? 'bg-danger' : 'bg-primary'} text-white">
            <h5>${allianceName} Alliance Strategy (${Math.round(alliance.totalPoints)} pts)</h5>
        </div>
        <div class="card-body text-white">`;
    
    // Point difference
    const pointDifference = alliance.totalPoints - opposingAlliance.totalPoints;
    const isLeading = pointDifference > 0;
    
    html += `<p><strong>${isLeading ? 'Advantage' : 'Disadvantage'}:</strong> 
        ${Math.abs(Math.round(pointDifference))} point ${isLeading ? 'lead' : 'deficit'}</p>`;
    
    // Endgame strategy
    html += '<h6>Endgame Strategy:</h6>';
    if (alliance.climbCapabilities.deep > 0) {
        html += `<p><strong>Strength:</strong> ${alliance.climbCapabilities.deep} deep climb ${alliance.climbCapabilities.deep > 1 ? 'robots' : 'robot'}</p>`;
    } else if (alliance.climbCapabilities.shallow > 0) {
        html += `<p><strong>Strength:</strong> ${alliance.climbCapabilities.shallow} shallow climb ${alliance.climbCapabilities.shallow > 1 ? 'robots' : 'robot'}</p>`;
    } else if (alliance.climbCapabilities.deep + alliance.climbCapabilities.shallow >= alliance.teams.length) {
        html += `<p>Coordinate climbing: ${alliance.climbCapabilities.deep} deep climb and ${alliance.climbCapabilities.shallow} shallow climb</p>`;
    } else {
        html += '<p>Some teams should focus on climbing while others maximize scoring.</p>';
    }
    
    // Auto strategy
    html += '<h6>Auto Strategy:</h6>';
    if (alliance.leaveBonus === alliance.teams.length) {
        html += '<p><strong>Strength:</strong> All teams likely to get leave bonus - capitalize on this.</p>';
    } else if (alliance.leaveBonus === 0) {
        html += '<p><strong>Weakness:</strong> None of your teams consistently achieve leave bonus - consider practicing this.</p>';
    } else {
        html += `<p>${alliance.leaveBonus}/${alliance.teams.length} teams likely to get leave bonus.</p>`;
    }
    
    // Compare auto points
    const autoDifference = alliance.autoPoints - opposingAlliance.autoPoints;
    if (Math.abs(autoDifference) > 5) {
        if (autoDifference > 0) {
            html += `<p><strong>Auto Advantage:</strong> +${Math.round(autoDifference)} points over opponent</p>`;
        } else {
            html += `<p><strong>Auto Disadvantage:</strong> ${Math.round(autoDifference)} points below opponent</p>`;
        }
    }
    
    // Teleop strategy
    html += '<h6>Teleop Strategy:</h6>';
    // Compare teleop points
    const teleopDifference = alliance.teleopPoints - opposingAlliance.teleopPoints;
    if (Math.abs(teleopDifference) > 5) {
        if (teleopDifference > 0) {
            html += `<p><strong>Teleop Advantage:</strong> +${Math.round(teleopDifference)} points over opponent</p>`;
        } else {
            html += `<p><strong>Teleop Disadvantage:</strong> ${Math.round(teleopDifference)} points below opponent</p>`;
        }
    }
    
    // Algae strategy
    const algaeNetAvg = alliance.algaeNetAvg / alliance.teams.length;
    const algaeProcessorAvg = alliance.algaeProcessorAvg / alliance.teams.length;
    
    if (algaeNetAvg > 1.5 && algaeProcessorAvg > 1.5) {
        html += '<p><strong>Versatile Scoring:</strong> Good at both algae net and processor scoring</p>';
    } else if (algaeNetAvg > 2) {
        html += '<p><strong>Net Focused:</strong> Strong at algae net scoring</p>';
    } else if (algaeProcessorAvg > 2) {
        html += '<p><strong>Processor Focused:</strong> Strong at algae processor scoring</p>';
    }
    
    html += '</div></div>';
    
    return html;
}

// Calculate scores for a team based on scoring rules from GAME_CONFIG
function calculateTeamScore(teamData) {
    // Initialize scores
    let autoScore = 0;
    let teleopScore = 0;
    let total = 0;
    
    try {
        // Get scoring rules from global config
        const scoringRules = GAME_CONFIG.scoring_rules || {};
        
        if (!teamData || typeof teamData !== 'object') {
            console.error("Invalid team data provided to calculateTeamScore:", teamData);
            return { auto: 0, teleop: 0, total: 0 };
        }
        
        // Calculate auto score
        // First check for leave bonus
        if ('Leave Bonus (T/F)' in teamData && scoringRules['Leave Bonus (T/F)']) {
            // Convert to boolean or check threshold (some teams use 0/1 instead of true/false)
            const leaveValue = typeof teamData['Leave Bonus (T/F)'] === 'boolean' ? 
                  teamData['Leave Bonus (T/F)'] : 
                  (parseFloat(teamData['Leave Bonus (T/F)']) >= 0.5);
            
            if (leaveValue) {
                autoScore += scoringRules['Leave Bonus (T/F)'];
            }
        }
        
        // Iterate through all keys in the scoring rules
        for (const key in scoringRules) {
            // Skip the leave bonus as we already handled it
            if (key === 'Leave Bonus (T/F)') continue;
            
            // Skip endgame barge as it needs special handling
            if (key === 'Endgame Barge') continue;
            
            // If the key exists in teamData, add its score
            if (key in teamData) {
                // Get the value and convert to number if needed
                let value = teamData[key];
                if (typeof value === 'string') {
                    value = parseFloat(value) || 0;
                }
                
                // Skip if value is not a number or is NaN
                if (typeof value !== 'number' || isNaN(value)) {
                    continue;
                }
                
                // Calculate score based on the scoring rule
                const points = scoringRules[key] * value;
                
                // Add to the appropriate category
                if (key.startsWith('Auto')) {
                    autoScore += points;
                } else if (key === 'Minor Fouls' || key === 'Major Fouls') {
                    // Fouls are negative points and don't belong to auto or teleop
                    total += points;
                } else {
                    teleopScore += points;
                }
            }
        }
        
        // Handle Endgame Barge separately
        if ('Endgame Barge' in teamData && 'Endgame Barge' in scoringRules) {
            const bargeValue = teamData['Endgame Barge'];
            if (typeof bargeValue === 'number' && !isNaN(bargeValue)) {
                // Round to nearest integer to get the key for the scoring rule
                const bargeKey = String(Math.round(bargeValue));
                if (bargeKey in scoringRules['Endgame Barge']) {
                    teleopScore += scoringRules['Endgame Barge'][bargeKey];
                }
            }
        }
        
        // Add auto and teleop to get total
        total += autoScore + teleopScore;
        
    } catch (error) {
        console.error("Error calculating team score:", error);
        // Return zeros if there's an error
        return { auto: 0, teleop: 0, total: 0 };
    }
    
    return { auto: autoScore, teleop: teleopScore, total: total };
}
