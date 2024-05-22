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
        match.team_A.players.some((player) => player.user.equals(stat.player))
      )
      .reduce((total, stat) => total + stat.pointsScored, 0);

    const teamBPoints = playerStats
      .filter((stat) =>
        match.team_B.players.some((player) => player.user.equals(stat.player))
      )
      .reduce((total, stat) => total + stat.pointsScored, 0);

    // Determine the winner
    if (teamAPoints > teamBPoints) {
      match.team_A.isWinner = true;
      match.team_B.isWinner = false;
    } else if (teamBPoints > teamAPoints) {
      match.team_A.isWinner = false;
      match.team_B.isWinner = true;
    }

    // Update match object with the winner and scores
    match.status = MatchStatus.FINISHED;
    match.team_A.matchScore = teamAPoints
    match.team_B.matchScore = teamBPoints

    // Save the updated match
    const updatedMatch = await match.save();

    return updatedMatch;
  } catch (error) {
    console.error("Failed to update match winner:", error.message);
    throw error;
  }
}

export { updateMatchWinner };
