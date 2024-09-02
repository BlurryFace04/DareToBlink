import { Schema, model, models, Document, Model } from 'mongoose'

interface SubmissionDocument extends Document {
  submissionNumber: number
  dareNumber: number
  address: string
  link: string
  timestamp: Date
}

const SubmissionSchema = new Schema<SubmissionDocument>({
  submissionNumber: {
    type: Number,
    required: [true, 'Submission number is required'],
    unique: true
  },
  dareNumber: {
    type: Number,
    required: [true, 'Dare number is required'],
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
  },
  link: {
    type: String,
    required: [true, 'Tweet link is required']
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
})

SubmissionSchema.pre<SubmissionDocument>('validate', async function(next) {
  if (this.isNew) {
    const model = this.constructor as Model<SubmissionDocument>
    const lastSubmission = await model.findOne().sort({ submissionNumber: -1 })
    this.submissionNumber = lastSubmission ? lastSubmission.submissionNumber + 1 : 1
  }
  next()
})

const Submission = models.Submission || model<SubmissionDocument>('Submission', SubmissionSchema)

export default Submission
