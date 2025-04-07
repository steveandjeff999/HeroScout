$(document).ready(function() {
    // Initialize by loading the latest configuration from the server first,
    // then proceed with the rest of the initialization
    loadLatestConfig().then(() => {
        // Continue with the existing initialization
        initializeWithConfig();
        
        // Authentication error handling
        $(document).ajaxError(function(event, jqXHR, settings, thrownError) {
            // If any AJAX request returns a 401 Unauthorized status,
            // it means the session has expired, so redirect to login
            if (jqXHR.status === 401) {
                window.location.href = '/login';
            }
        });

        // Hide spinner on page load
        hideSpinner();

        // Automatically load data for sections that do not require a team number
        loadAllTeamAveragesInitial();
        loadTeamRankingsInitial();
        
        // Initialize the alliance selection tool
        if (typeof initAllianceSelection === 'function') {
            initAllianceSelection();
        } else {
            console.error("Alliance selection initialization function not found!");
        }

        // Create initial load functions that don't show spinner
        function loadAllTeamAveragesInitial() {
            showSpinner(); // Show spinner on initial load too
            var format = $('#format_select_all_team_averages').val();
            $.ajax({
                url: '/get_all_team_averages',
                type: 'GET',
                dataType: 'json',
                timeout: 60000,  // Extend timeout to 60 seconds
                success: function(data) {
                    try {
                        console.log("Team averages data received:", Object.keys(data).length + " teams");
                        displayData(data, format, '#all_averages_result');
                    } catch (err) {
                        console.error("Error displaying team averages:", err);
                        $('#all_averages_result').html('<div class="alert alert-danger">Error processing team data: ' + err.message + '</div>');
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.error("Error loading team averages:", textStatus, errorThrown);
                    let errorMessage = textStatus;
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                        errorMessage = jqXHR.responseJSON.error;
                    }
                    
                    $('#all_averages_result').html(
                        '<div class="alert alert-danger">' +
                        '<h5>Error loading team averages</h5>' +
                        '<p><strong>Status:</strong> ' + textStatus + '</p>' +
                        '<p><strong>Details:</strong> ' + (errorThrown || 'Unknown error') + '</p>' +
                        '<p>' + errorMessage + '</p>' +
                        '</div>'
                    );
                },
                complete: function() {
                    hideSpinner();
                }
            });
        }

        function loadTeamRankingsInitial() {
            showSpinner(); // Show spinner on initial load too
            var format = $('#format_select_team_rankings').val();
            var sortOption = $('#rank_sort_option').val();
            
            $.get('/get_team_rankings', function(data) {
                // Convert from dictionary to array of objects for sorting
                var rankingsArray = Object.keys(data).map(function(key) {
                    return {team: key, points: data[key]};
                });
                
                // Sort the array based on the selected sort option
                rankingsArray = sortRankingsArray(rankingsArray, sortOption);
                
                displayTeamRankings(rankingsArray, format);
            }).fail(function(jqXHR, textStatus) {
                $('#rank_result').html('<div class="alert alert-danger">Error loading team rankings: ' + textStatus + '</div>');
            }).always(function() {
                hideSpinner();
            });
        }

        $('#search_button').click(function() {
            showSpinner();
            var teamNumber = $('#team_number').val().trim();
            var format = $('#format_select_team_average').val();
            if (teamNumber === "") {
                $('#result').html('<div class="alert alert-warning">Please enter a team number.</div>');
                hideSpinner();
                return;
            }
            $.post('/get_team_averages', { team_number: teamNumber }, function(data) {
                displayData(data, format, '#result');
            }).fail(function(jqXHR, textStatus) {
                $('#result').html('<div class="alert alert-danger">Error loading team data: ' + textStatus + '</div>');
            }).always(function() {
                hideSpinner();
            });
        });

        $('#get_all_averages').click(loadAllTeamAverages);

        $('#get_team_rankings').click(loadTeamRankings);

        $('#get_match_data').click(function() {
            showSpinner(); // Show spinner while loading match data
            var teamNumber = $('#match_team_number').val();
            var format = $('#format_select_match_data').val();
            if (teamNumber) {
                $.ajax({
                    url: '/get_match_data',
                    type: 'GET',
                    data: { team_number: teamNumber },
                    dataType: 'json',
                    success: function(data) {
                        displayData(data, format, '#match_result');
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.error("Error fetching match data:", textStatus, errorThrown);
                        
                        let errorMessage = textStatus;
                        if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                            errorMessage = jqXHR.responseJSON.error;
                        }
                        
                        $('#match_result').html(
                            '<div class="alert alert-danger">' +
                            '<h5>Error loading match data</h5>' +
                            '<p><strong>Status:</strong> ' + textStatus + '</p>' +
                            '<p><strong>Details:</strong> ' + (errorThrown || 'Unknown error') + '</p>' +
                            '<p>' + errorMessage + '</p>' +
                            '</div>'
                        );
                    },
                    complete: function() {
                        hideSpinner();
                    }
                });
            } else {
                $('#match_result').html('<div class="alert alert-warning">Please enter a team number.</div>');
                hideSpinner();
            }
        });

        $('#calculate_match_points').click(function() {
            showSpinner();
            var redTeams = [
                $('#red_team_1').val().trim(),
                $('#red_team_2').val().trim(),
                $('#red_team_3').val().trim()
            ].filter(team => team !== '');
            var blueTeams = [
                $('#blue_team_1').val().trim(),
                $('#blue_team_2').val().trim(),
                $('#blue_team_3').val().trim()
            ].filter(team => team !== '');
            var format = $('#format_select_match_estimation').val();

            if (redTeams.length === 0 && blueTeams.length === 0) {
                $('#match_points_result').html('<div class="alert alert-warning">Please enter at least one team number for either alliance.</div>');
                hideSpinner();
                return;
            }

            // Create a safeguard to make sure spinner gets hidden
            let spinnerTimeout = setTimeout(function() {
                console.log("Safety timeout: Force hiding spinner after 5 seconds");
                hideSpinner();
            }, 5000);

            // Create alliance mappings to track which alliance each team belongs to
            let allianceMappings = {};
            redTeams.forEach(team => {
                allianceMappings[team] = 'red';
            });
            blueTeams.forEach(team => {
                allianceMappings[team] = 'blue';
            });

            $.post('/calculate_match_points', { 
                red_teams: redTeams, 
                blue_teams: blueTeams,
                config: JSON.stringify(appConfig) // Send current configuration
            })
                .done(function(data) {
                    try {
                        console.log("Raw match data received:", data);
                        
                        // Validate data structure
                        if (!data) {
                            throw new Error("No data received");
                        }
                        
                        // Check for empty response
                        if (Object.keys(data).length === 0) {
                            $('#match_points_result').html('<div class="alert alert-warning">No match data could be calculated.</div>');
                            return;
                        }
                        
                        // Check for required properties
                        if (!('red_alliance_points' in data) && !('blue_alliance_points' in data) && !('team_points' in data)) {
                            throw new Error("Missing required data properties");
                        }
                        
                        // Apply alliance information from our front-end mappings
                        if (data.team_points) {
                            Object.keys(data.team_points).forEach(team => {
                                const teamData = data.team_points[team];
                                if (redTeams.includes(team)) {
                                    if (teamData) {
                                        teamData.alliance = 'red';
                                    } else {
                                        data.team_points[team] = {
                                            alliance: 'red',
                                            total: 0
                                        };
                                    }
                                } else if (blueTeams.includes(team)) {
                                    if (teamData) {
                                        teamData.alliance = 'blue';
                                    } else {
                                        data.team_points[team] = {
                                            alliance: 'blue',
                                            total: 0
                                        };
                                    }
                                }
                            });
                            
                            // Add any teams that might be missing in the response
                            [...redTeams, ...blueTeams].forEach(team => {
                                if (!data.team_points[team]) {
                                    data.team_points[team] = {
                                        alliance: allianceMappings[team],
                                        total: 0
                                    };
                                }
                            });
                        }
                        
                        // Sanitize data in case of null or undefined values
                        // For alliance points
                        if (data.red_alliance_points === null || data.red_alliance_points === undefined) {
                            data.red_alliance_points = 0;
                        }
                        if (data.blue_alliance_points === null || data.blue_alliance_points === undefined) {
                            data.blue_alliance_points = 0;
                        }
                        
                        // Display the data
                        displayData(data, format, '#match_points_result');
                        console.log("Match estimation data displayed successfully");
                        
                    } catch(error) {
                        console.error("Error displaying match estimation data:", error);
                        $('#match_points_result').html(`<div class="alert alert-danger">Error displaying match data: ${error.message}</div>`);
                    }
                })
                .fail(function(jqXHR, textStatus) {
                    $('#match_points_result').html('<div class="alert alert-danger">Error calculating match points: ' + textStatus + '</div>');
                })
                .always(function() {
                    // Always make sure the spinner is hidden when the request completes
                    hideSpinner();
                    clearTimeout(spinnerTimeout);
                    console.log("Match estimation request completed, spinner should be hidden");
                });
        });

        // Fix format change for match estimation
        $('#format_select_match_estimation').change(function() {
            // Only refetch if we have data already (check for something other than whitespace)
            const currentContent = $('#match_points_result').text().trim();
            if (currentContent && !currentContent.includes('Please enter at least one team')) {
                console.log("Format changed, refreshing match estimation data");
                $('#calculate_match_points').click();
            }
        });

        $('.format-select').change(function() {
            var tabId = $(this).closest('.tab-pane').attr('id');
            if (tabId === 'team_average') {
                $('#search_button').click();
            } else if (tabId === 'all_team_averages') {
                $('#get_all_averages').click();
            } else if (tabId === 'team_rankings') {
                $('#get_team_rankings').click();
            } else if (tabId === 'match_data') {
                $('#get_match_data').click();
            } else if (tabId === 'match_estimation') {
                $('#calculate_match_points').click();
            } else if (tabId === 'positioning') {
                $('#get_positioning').click();
            } else if (tabId === 'compare_teams') {
                $('#compare_teams_btn').click();
            }
        });

        function loadAllTeamAverages() {
            showSpinner();
            var format = $('#format_select_all_team_averages').val();
            $.ajax({
                url: '/get_all_team_averages',
                type: 'GET',
                dataType: 'json',
                timeout: 60000,  // Extend timeout to 60 seconds for large datasets
                success: function(data) {
                    try {
                        console.log("Team averages data received:", Object.keys(data).length + " teams");
                        displayData(data, format, '#all_averages_result');
                    } catch (err) {
                        console.error("Error displaying team averages:", err);
                        $('#all_averages_result').html('<div class="alert alert-danger">Error processing team data: ' + err.message + '</div>');
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.error("Error loading team averages:", textStatus, errorThrown);
                    console.error("Response:", jqXHR.responseText);
                    
                    let errorMessage = textStatus;
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                        errorMessage = jqXHR.responseJSON.error;
                    }
                    
                    $('#all_averages_result').html(
                        '<div class="alert alert-danger">' +
                        '<h5>Error loading team averages</h5>' +
                        '<p><strong>Status:</strong> ' + textStatus + '</p>' +
                        '<p><strong>Details:</strong> ' + (errorThrown || 'Unknown error') + '</p>' +
                        '<p>' + errorMessage + '</p>' +
                        '<p>Try refreshing or check the server logs.</p>' +
                        '</div>'
                    );
                },
                complete: function() {
                    hideSpinner();
                }
            });
        }

        function loadTeamRankings() {
            showSpinner();
            var format = $('#format_select_team_rankings').val();
            var sortOption = $('#rank_sort_option').val();
            
            $.get('/get_team_rankings', function(data) {
                // Convert from dictionary to array of objects for sorting
                var rankingsArray = Object.keys(data).map(function(key) {
                    return {team: key, points: data[key]};
                });
                
                // Sort the array based on the selected sort option
                rankingsArray = sortRankingsArray(rankingsArray, sortOption);
                
                displayTeamRankings(rankingsArray, format);
            }).fail(function(jqXHR, textStatus) {
                $('#rank_result').html('<div class="alert alert-danger">Error loading team rankings: ' + textStatus + '</div>');
            }).always(function() {
                hideSpinner();
            });
        }

        $('#rank_sort_option, #broke_sort_option, #tipped_sort_option').change(function() {
            // Trigger a refresh when the sort option changes
            var id = $(this).attr('id');
            if (id === 'rank_sort_option') {
                loadTeamRankings();
            } else if (id === 'broke_sort_option') {
                $('#get_most_died').click();
            } else if (id === 'tipped_sort_option') {
                $('#get_most_tipped').click();
            }
        });

        let selectedTeams = new Set();

        $('#add_team_btn').click(function() {
            const teamNumber = $('#add_team_input').val().trim();
            if (teamNumber && !selectedTeams.has(teamNumber)) {
                selectedTeams.add(teamNumber);
                updateTeamChips();
                $('#add_team_input').val('');
            }
        });

        // Add a function to fetch and add all available teams
        $('#add_all_teams_btn').click(function() {
            showSpinner();
            $.get('/get_all_teams', function(data) {
                if (data.teams && Array.isArray(data.teams)) {
                    data.teams.forEach(team => {
                        selectedTeams.add(team.toString());
                    });
                    updateTeamChips();
                } else {
                    alert('Failed to retrieve team list');
                }
            }).fail(function(jqXHR, textStatus, errorThrown) {
                alert('Error fetching teams: ' + textStatus);
            }).always(function() {
                hideSpinner();
            });
        });

        function updateTeamChips() {
            const container = $('#team_chips');
            container.empty();
            selectedTeams.forEach(team => {
                container.append(`<div class="team-chip" data-team="${team}">Team ${team} <span class="remove-team">&times;</span></div>`);
            });
        }

        $(document).on('click', '.remove-team', function() {
            const teamNumber = $(this).parent().data('team').toString();
            selectedTeams.delete(teamNumber);
            usedColors.clear(); // Reset color palette
            updateTeamChips();
        });

        $('#generate_chart').click(function() {
            showSpinner();
            
            if (selectedTeams.size === 0) {
                $('#team_chart').parent().html('<div class="alert alert-warning">Please select at least one team to generate a chart.</div>');
                hideSpinner();
                return;
            }
            
            const chartType = $('#chart_type').val();
            const metric = $('#chart_metric').val();
            const dataGrouping = $('#data_grouping').val();
            
            // Clear used colors when generating a new chart
            usedColors.clear();
            
            // If the chart type is pie and there's more than one team, we need to handle it differently
            if (chartType === 'pie') {
                // For pie chart, we need to prepare data for all teams at once
                const allTeamData = [];
                let teamsProcessed = 0;
                
                selectedTeams.forEach(teamNumber => {
                    $.get('/get_match_data', { team_number: teamNumber })
                        .then(function(matchData) {
                            if (matchData && matchData.length > 0) {
                                try {
                                    // Calculate the metric data for this team
                                    const metricData = calculateMetricData(matchData, metric);
                                    
                                    // Add to our collection
                                    allTeamData.push({
                                        team: teamNumber,
                                        values: metricData.values,
                                        labels: metricData.labels
                                    });
                                } catch (error) {
                                    console.error(`Error processing team ${teamNumber}:`, error);
                                }
                            }
                        })
                        .fail(function() {
                            console.error(`Failed to get match data for team ${teamNumber}`);
                        })
                        .always(function() {
                            teamsProcessed++;
                            
                            // Once all teams are processed, create the pie chart
                            if (teamsProcessed === selectedTeams.size) {
                                createPieChart(allTeamData);
                                hideSpinner();
                            }
                        });
                });
            } else {
                // For other chart types (bar, line, radar), we can set up a different structure
                let datasets = [];
                let teamsProcessed = 0;
                let allLabels = [];
                let allTeamData = [];
                
                selectedTeams.forEach(teamNumber => {
                    $.get('/get_match_data', { team_number: teamNumber })
                        .then(function(matchData) {
                            if (matchData && matchData.length > 0) {
                                try {
                                    // Calculate the metric data for this team
                                    const metricData = calculateMetricData(matchData, metric);
                                    
                                    // Store all the team's data for later processing
                                    allTeamData.push({
                                        team: teamNumber,
                                        matchData: metricData
                                    });
                                    
                                    // Collect all match labels
                                    metricData.labels.forEach(label => {
                                        if (!allLabels.includes(label)) {
                                            allLabels.push(label);
                                        }
                                    });
                                } catch (error) {
                                    console.error(`Error processing team ${teamNumber}:`, error);
                                }
                            }
                        })
                        .fail(function() {
                            console.error(`Failed to get match data for team ${teamNumber}`);
                        })
                        .always(function() {
                            teamsProcessed++;
                            
                            // Once all teams are processed, create the chart
                            if (teamsProcessed === selectedTeams.size) {
                                if (allTeamData.length > 0) {
                                    if (dataGrouping === 'average' && selectedTeams.size > 1) {
                                        // Create formatted datasets for team averages comparison
                                        let formattedDatasets = [];
                                        
                                        // For each metric (just one in this case), create a dataset
                                        const metricValues = allTeamData.map(data => 
                                            data.matchData.values.length > 0 ? data.matchData.values[0] : 0
                                        );
                                        
                                        // Get colors for each team
                                        const teamColors = allTeamData.map(() => getDistinctColor());
                                        
                                        formattedDatasets.push({
                                            label: getChartTitle(),
                                            data: metricValues,
                                            backgroundColor: teamColors,
                                            borderColor: teamColors,
                                            borderWidth: 1
                                        });
                                        
                                        createChart('bar', formattedDatasets, allTeamData.map(data => `Team ${data.team}`));
                                    } else {
                                        // For match-by-match data or single team average
                                        if ((chartType === 'line' || chartType === 'bar') && dataGrouping !== 'average') {
                                            // Sort match labels numerically for chronological order
                                            allLabels.sort((a, b) => {
                                                const matchNumA = parseInt(a.replace('Match ', ''));
                                                const matchNumB = parseInt(b.replace('Match ', ''));
                                                return matchNumA - matchNumB;
                                            });
                                            
                                            // Create datasets with aligned data for all matches
                                            datasets = allTeamData.map(teamData => {
                                                // Get a distinct color for this team
                                                const color = getDistinctColor();
                                                
                                                // Create a map of match label to value for this team
                                                const matchValueMap = {};
                                                teamData.matchData.labels.forEach((label, index) => {
                                                    matchValueMap[label] = teamData.matchData.values[index];
                                                });
                                                
                                                // Create aligned data array based on all possible match labels
                                                const alignedData = allLabels.map(label => 
                                                    matchValueMap[label] !== undefined ? matchValueMap[label] : null
                                                );
                                                
                                                let dataset = {
                                                    label: `Team ${teamData.team}`,
                                                    data: alignedData,
                                                    borderColor: color,
                                                    borderWidth: 2
                                                };
                                                
                                                if (chartType === 'line') {
                                                    dataset.backgroundColor = 'transparent';
                                                    dataset.tension = 0.1;
                                                    dataset.fill = false;
                                                    dataset.pointBackgroundColor = color;
                                                } else if (chartType === 'bar') {
                                                    dataset.backgroundColor = color;
                                                }
                                                
                                                return dataset;
                                            });
                                            
                                            createChart(chartType, datasets, allLabels);
                                        } else if (chartType === 'radar') {
                                            // For radar charts
                                            datasets = allTeamData.map(teamData => {
                                                const color = getDistinctColor();
                                                return {
                                                    label: `Team ${teamData.team}`,
                                                    data: teamData.matchData.values,
                                                    backgroundColor: color + '40', // Add transparency
                                                    borderColor: color,
                                                    pointBackgroundColor: color,
                                                    pointBorderColor: '#fff',
                                                    pointHoverBackgroundColor: '#fff',
                                                    pointHoverBorderColor: color
                                                };
                                            });
                                            
                                            createChart('radar', datasets, allTeamData[0].matchData.labels);
                                        }
                                    }
                                } else {
                                    $('#team_chart').parent().html('<div class="alert alert-warning">No valid data available for the selected teams.</div>');
                                }
                                hideSpinner();
                            }
                        });
                });
            }
        });

        $('#chart_type, #chart_metric, #data_grouping').change(function() {
            // Enable/disable relevant options based on selections
            const chartType = $('#chart_type').val();
            const dataGrouping = $('#data_grouping').val();
            
            // If pie chart is selected, force 'average' data grouping
            if (chartType === 'pie') {
                $('#data_grouping').val('average');
                $('#data_grouping').prop('disabled', true);
            } else {
                $('#data_grouping').prop('disabled', false);
            }
            
            // If 'radar' chart is selected, force 'average' data grouping
            if (chartType === 'radar') {
                $('#data_grouping').val('average');
                $('#data_grouping').prop('disabled', true);
            }
        });
        
        // Team comparison functionality
        $('#compare_teams_btn').click(function() {
            showSpinner();
            
            const teams = [
                $('#compare_team_1').val().trim(),
                $('#compare_team_2').val().trim(),
                $('#compare_team_3').val().trim()
            ].filter(team => team !== '');
            
            if (teams.length === 0) {
                $('#compare_result').html('<div class="alert alert-warning">Please enter at least one team number.</div>');
                hideSpinner();
                return;
            }
            
            const format = $('#format_select_compare').val();
            
            $.ajax({
                url: '/compare_teams',
                type: 'POST',
                data: { 'teams[]': teams },
                dataType: 'json',
                success: function(data) {
                    displayComparisonData(data, format);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.error("Error comparing teams:", textStatus, errorThrown);
                    
                    let errorMessage = textStatus;
                    if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                        errorMessage = jqXHR.responseJSON.error;
                    }
                    
                    $('#compare_result').html(
                        '<div class="alert alert-danger">' +
                        '<h5>Error comparing teams</h5>' +
                        '<p><strong>Status:</strong> ' + textStatus + '</p>' +
                        '<p><strong>Details:</strong> ' + (errorThrown || 'Unknown error') + '</p>' +
                        '<p>' + errorMessage + '</p>' +
                        '</div>'
                    );
                },
                complete: function() {
                    hideSpinner();
                }
            });
        });

        // Notes tab functionality
        $('#get_all_notes').click(function() {
            showSpinner();
            
            $.get('/get_all_notes', function(data) {
                displayNotesData(data);
            }).fail(function(jqXHR, textStatus) {
                $('#notes_results').html('<div class="alert alert-danger">Error loading notes: ' + textStatus + '</div>');
            }).always(function() {
                hideSpinner();
            });
        });

        // Sort notes when the sort option changes
        $('#notes_sort').change(function() {
            sortNotes($(this).val());
        });

        // Filter notes when typing in the search box (with debounce)
        let notesSearchTimeout;
        $('#notes_search').on('input', function() {
            clearTimeout(notesSearchTimeout);
            const searchTerm = $(this).val().trim();
            
            notesSearchTimeout = setTimeout(function() {
                filterNotes(searchTerm);
            }, 300);
        });

        // Clear notes search
        $('#clear_notes_search').click(function() {
            $('#notes_search').val('');
            filterNotes('');
        });

        // Function to display notes data
        function displayNotesData(data) {
            if (!data || data.length === 0) {
                $('#notes_results').html('<div class="no-results-message">No notes found.</div>');
                return;
            }
            
            // Store the original data for sorting and filtering
            $('#notes_results').data('notes', data);
            
            // Initial sort by match number ascending
            sortNotes($('#notes_sort').val());
        }

        // Function to sort notes based on selection
        function sortNotes(sortOption) {
            const notesData = $('#notes_results').data('notes');
            if (!notesData) return;
            
            // Sort the notes based on the selected option
            let sortedNotes = [...notesData];
            
            switch (sortOption) {
                case 'match_asc':
                    sortedNotes.sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
                    break;
                case 'match_desc':
                    sortedNotes.sort((a, b) => (b.match_number || 0) - (a.match_number || 0));
                    break;
                case 'team_asc':
                    sortedNotes.sort((a, b) => (a.team_number || 0) - (b.team_number || 0));
                    break;
                case 'team_desc':
                    sortedNotes.sort((a, b) => (b.team_number || 0) - (a.team_number || 0));
                    break;
            }
            
            // Render the sorted notes
            renderNotes(sortedNotes);
            
            // Reapply any current search filter
            const searchTerm = $('#notes_search').val().trim();
            if (searchTerm) {
                filterNotes(searchTerm);
            }
        }

        // Function to filter notes based on search term
        function filterNotes(searchTerm) {
            const notesData = $('#notes_results').data('notes');
            if (!notesData) return;
            
            if (!searchTerm) {
                // If no search term, just resort and display all notes
                sortNotes($('#notes_sort').val());
                return;
            }
            
            // Filter notes based on search term
            const filteredNotes = notesData.filter(note => {
                const teamMatch = note.team_number && note.team_number.toString().includes(searchTerm);
                const matchMatch = note.match_number && note.match_number.toString().includes(searchTerm);
                const textMatch = note.observation && note.observation.toLowerCase().includes(searchTerm.toLowerCase());
                const scouterMatch = note.scouter_name && note.scouter_name.toLowerCase().includes(searchTerm.toLowerCase());
                
                return teamMatch || matchMatch || textMatch || scouterMatch;
            });
            
            if (filteredNotes.length === 0) {
                $('#notes_results').html('<div class="no-results-message">No notes found matching "' + escapeHtml(searchTerm) + '"</div>');
                return;
            }
            
            // Sort the filtered notes
            const sortOption = $('#notes_sort').val();
            switch (sortOption) {
                case 'match_asc':
                    filteredNotes.sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
                    break;
                case 'match_desc':
                    filteredNotes.sort((a, b) => (b.match_number || 0) - (a.match_number || 0));
                    break;
                case 'team_asc':
                    filteredNotes.sort((a, b) => (a.team_number || 0) - (b.team_number || 0));
                    break;
                case 'team_desc':
                    filteredNotes.sort((a, b) => (b.team_number || 0) - (a.team_number || 0));
                    break;
            }
            
            // Render the filtered and sorted notes, with search term highlighted
            renderNotes(filteredNotes, searchTerm);
        }

        function renderNotes(notes, highlightTerm = '') {
            if (!notes || notes.length === 0) {
                $('#notes_results').html('<div class="no-results-message">No notes found.</div>');
                return;
            }
            
            let html = '<div class="notes-container">';
            
            notes.forEach(note => {
                let observation = escapeHtml(note.observation || '');
                
                // Highlight search term if provided
                if (highlightTerm) {
                    observation = highlightText(observation, highlightTerm);
                }
                
                // Replace newlines with <br>
                observation = observation.replace(/\n/g, '<br>');
                
                html += `
                    <div class="card note-card mb-3">
                        <div class="card-header">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <span class="badge badge-primary team-badge">Team ${note.team_number || 'Unknown'}</span>
                                    <span class="badge badge-secondary match-badge">Match ${note.match_number || 'Unknown'}</span>
                                </div>
                                <small class="text-muted">Scouter: ${note.scouter_name || 'Unknown'}</small>
                            </div>
                        </div>
                        <div class="card-body">
                            <p class="note-text">${observation}</p>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            
            $('#notes_results').html(html);
        }
        
        // Helper function to sort rankings array based on option
        function sortRankingsArray(rankingsArray, sortOption) {
            switch(sortOption) {
                case 'rank':
                    return rankingsArray.sort((a, b) => b.points - a.points);
                case 'rank_asc':
                    return rankingsArray.sort((a, b) => a.points - b.points);
                case 'team':
                    return rankingsArray.sort((a, b) => parseInt(a.team) - parseInt(b.team));
                case 'team_desc':
                    return rankingsArray.sort((a, b) => parseInt(b.team) - parseInt(a.team));
                default:
                    return rankingsArray;
            }
        }

        // Positioning Tab Functionality
        $('#get_positioning').click(function() {
            showSpinner();
            
            const teamNumber = $('#positioning_team_number').val().trim();
            const format = $('#format_select_positioning').val();
            
            if (!teamNumber) {
                $('#positioning_result').html('<div class="alert alert-warning">Please enter a team number.</div>');
                hideSpinner();
                return;
            }
            
            // Get team match data
            $.get('/get_match_data', { team_number: teamNumber })
                .done(function(matchData) {
                    if (!matchData || matchData.length === 0) {
                        $('#positioning_result').html('<div class="alert alert-warning">No match data found for Team ' + teamNumber + '.</div>');
                        hideSpinner();
                        return;
                    }
                    
                    // Also get team averages for additional context
                    $.post('/get_team_averages', { team_number: teamNumber })
                        .done(function(averageData) {
                            // Display positioning data with both match data and averages
                            displayPositioningData(teamNumber, matchData, averageData.averages, format);
                        })
                        .fail(function() {
                            // If averages fail, just use match data
                            displayPositioningData(teamNumber, matchData, null, format);
                        })
                        .always(function() {
                            hideSpinner();
                        });
                })
                .fail(function(jqXHR, textStatus) {
                    $('#positioning_result').html('<div class="alert alert-danger">Error loading match data: ' + textStatus + '</div>');
                    hideSpinner();
                });
        });

        // Match Strategy Tab Functionality
        $('#analyze_strategy').click(function() {
            showSpinner();
            
            const redTeams = [
                $('#strategy_red_1').val().trim(),
                $('#strategy_red_2').val().trim(),
                $('#strategy_red_3').val().trim()
            ].filter(team => team !== '');
            
            const blueTeams = [
                $('#strategy_blue_1').val().trim(),
                $('#strategy_blue_2').val().trim(),
                $('#strategy_blue_3').val().trim()
            ].filter(team => team !== '');
            
            if (redTeams.length === 0 && blueTeams.length === 0) {
                $('#strategy_result').html('<div class="alert alert-warning">Please enter at least one team for each alliance.</div>');
                hideSpinner();
                return;
            }
            
            // Get team data for both alliances
            const allTeams = [...redTeams, ...blueTeams];
            const teamData = {};
            let teamsProcessed = 0;
            
            allTeams.forEach(team => {
                $.post('/get_team_averages', { team_number: team })
                    .done(function(data) {
                        teamData[team] = data.averages || {};
                    })
                    .fail(function() {
                        teamData[team] = { error: true };
                    })
                    .always(function() {
                        teamsProcessed++;
                        
                        if (teamsProcessed === allTeams.length) {
                            // All teams processed, analyze and display results
                            const redAlliance = analyzeTeams(redTeams, teamData);
                            const blueAlliance = analyzeTeams(blueTeams, teamData);
                            
                            displayStrategyAnalysis(redAlliance, blueAlliance);
                            hideSpinner();
                        }
                    });
            });
        });
        
        function analyzeTeams(teams, teamData) {
            const alliance = {
                teams: [],
                totalPoints: 0,
                autoPoints: 0,
                teleopPoints: 0,
                climbCapabilities: {
                    deep: 0,
                    shallow: 0,
                    parked: 0
                },
                leaveBonus: 0,
                algaeNetAvg: 0,
                algaeProcessorAvg: 0
            };
            
            teams.forEach(team => {
                if (!teamData[team] || teamData[team].error) return;
                
                const data = teamData[team];
                
                // Use the calculateTeamScore function from data-display.js for consistency
                const scores = calculateTeamScore(data);
                
                // Extract the auto and teleop scores
                const autoScore = scores.auto;
                const teleopScore = scores.teleop;
                const totalPoints = scores.total;
                
                // Add to algae stats
                alliance.algaeNetAvg += (data['Algae Net (#)'] || 0);
                alliance.algaeProcessorAvg += (data['Algae Processor (#)'] || 0);
                
                // Check for leave bonus
                if (data['Leave Bonus (T/F)'] && data['Leave Bonus (T/F)'] > 0.5) {
                    alliance.leaveBonus++;
                }
                
                // Calculate climb capability
                const bargeValue = data['Endgame Barge'] || 0;
                let climbCapability = 'None';
                let climbPoints = 0;
                
                if (bargeValue >= 0.5 && bargeValue < 1.5) {
                    climbCapability = 'Parked';
                    alliance.climbCapabilities.parked++;
                } else if (bargeValue >= 1.5 && bargeValue < 2.5) {
                    climbCapability = 'Shallow Climb';
                    alliance.climbCapabilities.shallow++;
                } else if (bargeValue >= 2.5) {
                    climbCapability = 'Deep Climb';
                    alliance.climbCapabilities.deep++;
                }
                
                // Add to alliance totals
                alliance.autoPoints += autoScore;
                alliance.teleopPoints += teleopScore;
                alliance.totalPoints += totalPoints;
                
                // Add team to alliance with additional data
                alliance.teams.push({
                    teamNumber: team,
                    autoScore,
                    teleopScore,
                    totalPoints,
                    climbCapability,
                    leaveBonus: data['Leave Bonus (T/F)'] && data['Leave Bonus (T/F)'] > 0.5,
                    autoAlgaeNet: data['Auto Algae Net (#)'] || 0,
                    autoAlgaeProcessor: data['Auto Algae Processor (#)'] || 0,
                    teleopAlgaeNet: data['Algae Net (#)'] || 0,
                    teleopAlgaeProcessor: data['Algae Processor (#)'] || 0,
                    autoCoralL1: data['Auto Coral L1 (#)'] || 0,
                    autoCoralL2L3: data['Auto Coral L2/L3 (#)'] || 0,
                    teleopCoralL1: data['Coral L1 (#)'] || 0,
                    teleopCoralL2L3: data['Coral L2/L3 (#)'] || 0
                });
            });
            
            // Calculate averages
            if (alliance.teams.length > 0) {
                alliance.algaeNetAvg /= alliance.teams.length;
                alliance.algaeProcessorAvg /= alliance.teams.length;
            }
            
            return alliance;
        }

        // Export PDF functionality
        $('#exportPDF').click(function() {
            showSpinner();
            
            const activeTab = $('.tab-pane.active');
            const tabId = activeTab.attr('id');
            const tabName = $('#mainNavTabs a[href="#' + tabId + '"]').text().trim();
            
            // Create a temporary div to capture the current view
            const captureElement = document.createElement('div');
            $(captureElement).addClass('pdf-capture').css({
                'background-color': '#1a1a2e',
                'padding': '20px',
                'color': 'white',
                'width': '800px'
            });
            
            // Add a header with the tab name and date
            const currentDate = new Date().toLocaleDateString();
            $(captureElement).append(`
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #7065a2;">${tabName} - Team Data Dashboard</h2>
                    <p>Generated on ${currentDate}</p>
                </div>
            `);
            
            // Clone the content we want to export
            const contentToExport = activeTab.find('.data-card').clone();
            
            // Adjust some styling for better PDF output
            contentToExport.find('table').css('width', '100%');
            contentToExport.find('th, td').css('padding', '8px');
            
            $(captureElement).append(contentToExport);
            
            // Add to document temporarily (invisible)
            $(captureElement).css('position', 'absolute').css('left', '-9999px');
            document.body.appendChild(captureElement);
            
            // Use html2canvas to capture the element
            html2canvas(captureElement, {
                backgroundColor: '#1a1a2e',
                scale: 1,
                logging: false,
                allowTaint: true,
                useCORS: true
            }).then(canvas => {
                // Create PDF
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jspdf.jsPDF({
                    orientation: 'portrait',
                    unit: 'mm'
                });
                
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
                const imgX = (pdfWidth - imgWidth * ratio) / 2;
                
                pdf.addImage(imgData, 'PNG', imgX, 10, imgWidth * ratio, imgHeight * ratio);
                
                // Save the PDF
                pdf.save(`Team-Data-${tabName}-${currentDate}.pdf`);
                
                // Remove the temporary element
                document.body.removeChild(captureElement);
                hideSpinner();
            }).catch(error => {
                console.error('Error generating PDF:', error);
                alert('Error generating PDF. Please try again.');
                document.body.removeChild(captureElement);
                hideSpinner();
            });
        });
        
        // Make sure to clear the interval when the page is unloaded
        $(window).on('beforeunload', function() {
            if (searchRefreshInterval) {
                clearInterval(searchRefreshInterval);
            }
        });

        // Update search when tab changes
        $('#mainNavTabs a').on('shown.bs.tab', function() {
            const searchTerm = $('#enhanced-search').val().trim();
            if (searchTerm) {
                filterEnhancedSearchResults(searchTerm);
            }
        });

        // Initialize tooltips
        $('[data-toggle="tooltip"]').tooltip();

        // Handle info icon clicks
        $('.info-icon').on('click', function(e) {
            e.preventDefault();
            const tabId = $(this).data('tab');
            $('#modal_' + tabId).modal('show');
        });

        // Initialize team search on page load
        initTeamSearch();
    }).catch(error => {
        console.error("Failed to load configuration from server:", error);
        
        // Continue with local configuration as fallback
        initializeWithConfig();
        
        // Rest of your initialization code...
        hideSpinner();
        loadAllTeamAveragesInitial();
        loadTeamRankingsInitial();
    });
});

// Function to load the latest config from the server
function loadLatestConfig() {
    return new Promise((resolve, reject) => {
        $.get('/get_config')
            .done(function(serverConfig) {
                // Update the local GAME_CONFIG with server values
                if (serverConfig) {
                    console.log("Loaded configuration from server");
                    
                    // Replace local config with server config
                    Object.assign(GAME_CONFIG, serverConfig);
                    
                    // Update chart colors in case they were changed
                    CHART_COLORS.splice(0, CHART_COLORS.length, ...GAME_CONFIG.chart_colors);
                    
                    resolve();
                } else {
                    console.warn("Received empty configuration from server, using local config");
                    reject(new Error("Empty configuration"));
                }
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.warn("Failed to load server configuration:", textStatus, errorThrown);
                reject(new Error(textStatus));
            });
    });
}

// Function to initialize the application with the latest configuration
function initializeWithConfig() {
    // Store the configuration locally for easy access
    appConfig = GAME_CONFIG;
    
    // Ensure the server has the latest configuration
    $.post('/update_config', { config: JSON.stringify(appConfig) })
        .done(function(response) {
            console.log('Server configuration updated successfully:', response);
        })
        .fail(function(error) {
            console.error('Failed to update server configuration:', error);
        });
}
