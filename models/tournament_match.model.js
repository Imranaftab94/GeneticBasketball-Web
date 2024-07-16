import mongoose from 'mongoose'
import { MatchStatus } from '../constants/match-status.constant.js'

const matcheSchema = new mongoose.Schema(
  {
    community_center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunityCenter',
      required: true
    },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
    name: {
      type: String,
      default: null
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
    day: {
      type: String,
      required: true
    },
    status: {
      type: String,
      default: MatchStatus.UPCOMING
    },
    match_date: {
      type: Date,
      required: true
    },
    team_A: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament_Team'
    },
    team_B: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament_Team'
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    highlights: {
      type: new mongoose.Schema({
        name: {
          type: String,
          default: null
        },
        awsUrl: {
          type: String,
          default: null
        },
        thumbnailImage: {
          type: String,
          default: null
        }
      }),
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true }, // Ensure virtual fields are serialized
    toObject: { virtuals: true }
  }
)

matcheSchema.virtual('match_type').get(function () {
  return 'TOURNAMENT_MATCH'
})

// Create the model from the schema and export it
const TournamentMatches = mongoose.model('Tournament_Match', matcheSchema)
export { TournamentMatches }
