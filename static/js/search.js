// Team search functionality

let searchCache = {};
let searchTimeout;
let searchActive = false;
let searchRefreshInterval;  // Variable to store the interval ID

// Create a new endpoint to handle team search with stats
function createTeamSearchEndpoint() {
    // Use the Flask endpoint to get all team data
    return $.get('/get_all_team_averages')
        .then(function(allAverages) {
            searchCache.allTeams = allAverages;
            return allAverages;
        });
}

// Function to refresh search data in background and log the activity
function refreshSearchDataBackground() {
    if (!searchActive) {
        searchActive = true;
        
        // Log the refresh attempt
        $.post('/log_search_refresh', { message: 'Background refresh started' })
            .always(function() {
                // Get fresh data
                createTeamSearchEndpoint()
                    .then(function() {
                        console.log("Search data refreshed in background");
                        $.post('/log_search_refresh', { message: 'Background refresh completed successfully' });
                    })
                    .catch(function(error) {
                        console.error("Failed to refresh search data:", error);
                        $.post('/log_search_refresh', { message: 'Background refresh failed: ' + error.statusText });
                    })
                    .always(function() {
                        searchActive = false;
                    });
            });
    }
}

// Function to preload search data in background
function preloadSearchData() {
    // Only fetch if we don't have cached data
    if (!searchCache.allTeams && !searchActive) {
        searchActive = true;
        
        // Log the preload attempt
        $.post('/log_search_refresh', { message: 'Initial data preload started' });
        
        createTeamSearchEndpoint()
            .then(function() {
                console.log("Search data preloaded successfully");
                $.post('/log_search_refresh', { message: 'Initial data preload completed successfully' });
            })
            .catch(function(error) {
                console.error("Failed to preload search data:", error);
                $.post('/log_search_refresh', { message: 'Initial data preload failed: ' + error.statusText });
            })
            .always(function() {
                searchActive = false;
            });
    }
}

// Function to initialize the search system
function initTeamSearch() {
    // Set up event listeners
    $('#enhanced-search').on('input', function() {
        const searchTerm = $(this).val().trim();
        
        clearTimeout(searchTimeout);
        
        if (searchTerm.length > 0) {
            searchTimeout = setTimeout(function() {
                performTeamSearch(searchTerm);
            }, 300); // 300ms debounce
        } else {
            $('#search-results').hide();
            resetAllFilters();
        }
    });
    
    // Handle clicking outside to close the dropdown
    $(document).on('click', function(event) {
        if (!$(event.target).closest('.global-search-container').length) {
            $('#search-results').hide();
        }
    });
    
    // Handle clear button
    $('#clear-enhanced-search').on('click', function() {
        $('#enhanced-search').val('');
        $('#search-results').hide();
        resetAllFilters();
    });
    
    // Handle focus event to show previous results
    $('#enhanced-search').on('focus', function() {
        const searchTerm = $(this).val().trim();
        if (searchTerm.length > 0) {
            performTeamSearch(searchTerm);
        }
    });
    
    // Preload search data after page loads
    setTimeout(preloadSearchData, 2000);
    
    // Set up periodic refresh every 1.25 minutes (75000 milliseconds)
    searchRefreshInterval = setInterval(refreshSearchDataBackground, 75000);
    
    // Log that the refresh timer was started
    $.post('/log_search_refresh', { message: 'Search refresh timer started (75 second interval)' });
}

function resetAllFilters() {
    // Reset any filtered tables, lists or content
    $('.data-card pre, .data-card table, .data-card ul').each(function() {
        const originalHtml = $(this).closest('.data-card').data('original-html');
        if (originalHtml) {
            $(this).closest('.data-card').html(originalHtml);
        }
    });
    $('.team-chip').show();
}

// Function to perform team search
function performTeamSearch(searchTerm) {
    // If we don't have the data cached yet, fetch it
    if (!searchCache.allTeams) {
        $('#search-results').html('<div class="search-loading">Loading team data...</div>').show();
        
        createTeamSearchEndpoint()
            .then(function(allTeams) {
                filterTeamsAndDisplay(searchTerm, allTeams);
            })
            .catch(function(error) {
                $('#search-results').html('<div class="no-results">Error loading team data. Please try again.</div>');
            });
    } else {
        // Use the cached data
        filterTeamsAndDisplay(searchTerm, searchCache.allTeams);
    }
    
    // Also apply the search filter to any visible content
    filterEnhancedSearchResults(searchTerm);
}

// Function to filter teams and display results
function filterTeamsAndDisplay(searchTerm, allTeams) {
    const results = filterTeams(searchTerm, allTeams);
    renderTeamSearchResults(results, searchTerm);
}

// Filter teams based on search term
function filterTeams(searchTerm, allTeams) {
    const results = [];
    
    // If it's a numeric search, prioritize exact and starts-with matches
    if (/^\d+$/.test(searchTerm)) {
        // Search by team number
        Object.keys(allTeams).forEach(teamNumber => {
            const teamData = allTeams[teamNumber];
            
            // Calculate a relevance score - exact matches are best, then starts-with
            let relevance = 0;
            
            if (teamNumber === searchTerm) {
                relevance = 100; // Exact match is highest priority
            } else if (teamNumber.startsWith(searchTerm)) {
                relevance = 90 - (teamNumber.length - searchTerm.length); // Starts with, shorter is better
            } else if (teamNumber.includes(searchTerm)) {
                relevance = 60; // Contains the number somewhere
            } else {
                return; // Skip this team if no match
            }
            
            // Calculate scores
            let autoScore = 0;
            let teleopScore = 0;
            
            // Add auto scores
            if (teamData['Leave Bonus (T/F)'] && teamData['Leave Bonus (T/F)'] > 0.5) {
                autoScore += 3;
            }
            
            autoScore += (teamData['Auto Coral L1 (#)'] || 0) * 3;
            autoScore += (teamData['Auto Coral L2/L3 (#)'] || 0) * 5;
            autoScore += (teamData['Auto Coral L4 (#)'] || 0) * 7;
            autoScore += (teamData['Auto Coral Unclear (#)'] || 0) * 4;
            autoScore += (teamData['Auto Algae Net (#)'] || 0) * 4;
            autoScore += (teamData['Auto Algae Processor (#)'] || 0) * 6;
            
            // Add teleop scores
            teleopScore += (teamData['Coral L1 (#)'] || 0) * 2;
            teleopScore += (teamData['Coral L2/L3 (#)'] || 0) * 3.5;
            teleopScore += (teamData['Coral L4 (#)'] || 0) * 5;
            teleopScore += (teamData['Coral Unclear (#)'] || 0) * 3;
            teleopScore += (teamData['Algae Net (#)'] || 0) * 4;
            teleopScore += (teamData['Algae Processor (#)'] || 0) * 6;
            
            // Add endgame points
            const bargeValue = teamData['Endgame Barge'] || 0;
            if (bargeValue >= 0.5 && bargeValue < 1.5) teleopScore += 2;
            else if (bargeValue >= 1.5 && bargeValue < 2.5) teleopScore += 6;
            else if (bargeValue >= 2.5) teleopScore += 12;
            
            // Calculate total
            const totalScore = autoScore + teleopScore;
            
            // Add to results
            results.push({
                teamNumber,
                relevance,
                autoScore,
                teleopScore,
                totalScore,
                defenseRating: teamData['Defense Performed'] || 0
            });
        });
        
        // Sort by relevance (high to low)
        results.sort((a, b) => b.relevance - a.relevance);
    } else {
        // More complex search like "best auto" or "top teleop" or "defense"
        const lowerSearch = searchTerm.toLowerCase();
        
        // Define search categories
        const categories = {
            'auto': (team) => team.autoScore,
            'autonomous': (team) => team.autoScore,
            'teleop': (team) => team.teleopScore,
            'total': (team) => team.totalScore,
            'score': (team) => team.totalScore,
            'defense': (team) => team.defenseRating,
            'best': (team) => team.totalScore,
            'top': (team) => team.totalScore
        };
        
        // First, process all teams to get their scores
        const allTeamScores = [];
        
        Object.keys(allTeams).forEach(teamNumber => {
            const teamData = allTeams[teamNumber];
            
            // Calculate scores
            let autoScore = 0;
            let teleopScore = 0;
            
            // Add auto scores
            if (teamData['Leave Bonus (T/F)'] && teamData['Leave Bonus (T/F)'] > 0.5) {
                autoScore += 3;
            }
            
            autoScore += (teamData['Auto Coral L1 (#)'] || 0) * 3;
            autoScore += (teamData['Auto Coral L2/L3 (#)'] || 0) * 5;
            autoScore += (teamData['Auto Coral L4 (#)'] || 0) * 7;
            autoScore += (teamData['Auto Coral Unclear (#)'] || 0) * 4;
            autoScore += (teamData['Auto Algae Net (#)'] || 0) * 4;
            autoScore += (teamData['Auto Algae Processor (#)'] || 0) * 6;
            
            // Add teleop scores
            teleopScore += (teamData['Coral L1 (#)'] || 0) * 2;
            teleopScore += (teamData['Coral L2/L3 (#)'] || 0) * 3.5;
            teleopScore += (teamData['Coral L4 (#)'] || 0) * 5;
            teleopScore += (teamData['Coral Unclear (#)'] || 0) * 3;
            teleopScore += (teamData['Algae Net (#)'] || 0) * 4;
            teleopScore += (teamData['Algae Processor (#)'] || 0) * 6;
            
            // Add endgame points
            const bargeValue = teamData['Endgame Barge'] || 0;
            if (bargeValue >= 0.5 && bargeValue < 1.5) teleopScore += 2;
            else if (bargeValue >= 1.5 && bargeValue < 2.5) teleopScore += 6;
            else if (bargeValue >= 2.5) teleopScore += 12;
            
            // Calculate total and add to collection
            const totalScore = autoScore + teleopScore;
            
            allTeamScores.push({
                teamNumber,
                autoScore,
                teleopScore,
                totalScore,
                defenseRating: teamData['Defense Performed'] || 0
            });
        });
        
        // Now determine which category to sort by
        let sortCategory = null;
        let sortDescending = true;
        
        for (const category in categories) {
            if (lowerSearch.includes(category)) {
                sortCategory = categories[category];
                break;
            }
        }
        
        // If we found a category, sort by it
        if (sortCategory) {
            allTeamScores.sort((a, b) => sortDescending ? 
                sortCategory(b) - sortCategory(a) : 
                sortCategory(a) - sortCategory(b));
            
            // Take the top results
            return allTeamScores.slice(0, 10);
        }
        
        // If no special category, try to match team number as a fallback
        Object.keys(allTeams).forEach(teamNumber => {
            if (teamNumber.includes(searchTerm)) {
                const teamData = allTeamScores.find(t => t.teamNumber === teamNumber);
                if (teamData) {
                    results.push(teamData);
                }
            }
        });
    }
    
    // Limit results to avoid overwhelming the dropdown
    return results.slice(0, 10);
}

// Render team search results
function renderTeamSearchResults(results, searchTerm) {
    const $resultsContainer = $('#search-results');
    
    if (!results || results.length === 0) {
        $resultsContainer.html('<div class="no-results">No teams found matching your search.</div>').show();
        return;
    }
    
    let html = '';
    results.forEach(team => {
        const teamNumber = team.teamNumber;
        let highlightedNumber = highlightText(teamNumber, searchTerm);
        
        // Format scores for display
        let displayText = '';
        if (team.totalScore !== undefined) {
            displayText = `Total: ${team.totalScore.toFixed(1)} pts | Auto: ${team.autoScore.toFixed(1)} | Teleop: ${team.teleopScore.toFixed(1)}`;
        }
        
        html += `
            <div class="search-result-item" data-team="${teamNumber}">
                <div class="team-info">
                    <div class="team-number">${highlightedNumber}</div>
                    <div class="team-stats">${displayText}</div>
                </div>
                <div class="team-action">View</div>
            </div>
        `;
    });
    
    if (html === '') {
        $resultsContainer.html('<div class="no-results">No teams found matching your search.</div>').show();
        return;
    }
    
    $resultsContainer.html(html).show();
    
    // Add click handlers to team results
    $('.search-result-item').on('click', function() {
        const teamNumber = $(this).data('team');
        navigateToTeamDetails(teamNumber);
    });
}

// Navigate to team details page
function navigateToTeamDetails(teamNumber) {
    // Switch to team averages tab
    $('#mainNavTabs a[href="#team_average"]').tab('show');
    
    // Set the team number in the input field
    $('#team_number').val(teamNumber);
    
    // Trigger the search button click to load the data
    $('#search_button').click();
    
    // Hide search results
    $('#search-results').hide();
    
    // Clear the search field
    $('#enhanced-search').val('');
}

// Filter content based on enhanced search term
function filterEnhancedSearchResults(searchTerm) {
    // Get the active tab
    const activeTab = $('.tab-pane.active').attr('id');
    
    // Special handling for different tabs
    if (activeTab === 'team_average' || activeTab === 'match_data') {
        // For these tabs, if the search is numeric and the input fields are empty,
        // set the value and trigger search
        if (/^\d+$/.test(searchTerm)) {
            const inputSelector = activeTab === 'team_average' ? '#team_number' : '#match_team_number';
            if ($(inputSelector).val() === '') {
                $(inputSelector).val(searchTerm);
                const buttonSelector = activeTab === 'team_average' ? '#search_button' : '#get_match_data';
                $(buttonSelector).click();
                return;
            }
        }
    }
    
    // For the charts tab, filter team chips
    if (activeTab === 'charts') {
        $('.team-chip').each(function() {
            const teamNumber = $(this).data('team').toString();
            if (searchTerm === '' || teamNumber.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
        return;
    }
    
    // For all other tabs with data, filter the content
    const containerSelectors = {
        'team_average': '#result',
        'all_team_averages': '#all_averages_result',
        'team_rankings': '#rank_result',
        'match_data': '#match_result',
        'match_estimation': '#match_points_result',
        'compare_teams': '#compare_result',
        'most_died': '#most_died_result',
        'most_tipped': '#most_tipped_result',
        'notes': '#notes_results',
        'positioning': '#positioning_result'
    };
    
    const containerSelector = containerSelectors[activeTab];
    if (!containerSelector) return;
    
    const $container = $(containerSelector);
    
    // If there's no content, no need to filter
    if ($container.children().length === 0) return;
    
    // Get the original HTML if it exists
    const originalHtml = $container.data('original-html');
    if (!originalHtml) return;
    
    // If search is empty, restore original
    if (!searchTerm) {
        $container.html(originalHtml);
        return;
    }
    
    // Create a temporary div to parse the HTML
    const $temp = $('<div>').html(originalHtml);
    
    // Highlight search term in different data formats
    if ($temp.find('table').length > 0) {
        // Table format
        $temp.find('td').each(function() {
            const text = $(this).text();
            if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
                $(this).html(highlightText(text, searchTerm));
                $(this).closest('tr').addClass('highlight-row');
            }
        });
    } else if ($temp.find('ul').length > 0) {
        // List format
        $temp.find('li').each(function() {
            const text = $(this).html();
            if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
                $(this).html(highlightText(text, searchTerm));
            }
        });
    } else if ($temp.find('pre').length > 0) {
        // JSON format - more complex because we need to preserve formatting
        const jsonText = $temp.find('pre').text();
        const highlightedJson = highlightText(jsonText, searchTerm);
        $temp.find('pre').html(highlightedJson);
    }
    
    // Apply the filtered content back to the container
    $container.html($temp.html());
}
