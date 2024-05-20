import { MatchStatus } from "../constants/match-status.constant.js";
import { Matches } from "../models/matches.model.js";
import { PlayerMatchStats } from "../models/player_stats.model.js";

async function updateMatchWinner(matchId) {
  try {
    // Find the match
    const match = await Matches.findById(matchId);
    if (!match) {
      throw new Error("Match not found");
    }

    // Get player stats for the match
    const playerStats = await PlayerMatchStats.find({ match: matchId });
    if (!playerStats.length === 0) {
      throw new Error("Match not found");
    }

    // Calculate total points for team A and team B
    const teamAPoints = playerStats
      .filter((stat) =>
        match.team_A.some((player) => player.user.equals(stat.player))
      )
      .reduce((total, stat) => total + stat.pointsScored, 0);

    const teamBPoints = playerStats
      .filter((stat) =>
        match.team_B.some((player) => player.user.equals(stat.player))
      )
      .reduce((total, stat) => total + stat.pointsScored, 0);

    // Determine the winner
    let winner = null;
    if (teamAPoints > teamBPoints) {
      winner = "team_A";
    } else if (teamBPoints > teamAPoints) {
      winner = "team_B";
    }

    // Update match object with the winner and scores
    match.status = MatchStatus.FINISHED;
    match.match_score = {
      team_A: teamAPoints,
      team_B: teamBPoints,
      winner: winner,
    };

    // Save the updated match
    await match.save();

    return match;
  } catch (error) {
    console.error("Failed to update match winner:", error.message);
    throw error;
  }
}

export { updateMatchWinner };
