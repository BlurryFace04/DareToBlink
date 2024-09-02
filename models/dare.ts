import { Schema, model, models, Document, Model } from 'mongoose'

interface DareDocument extends Document {
  dareNumber: number
  address: string
  title: string
  description: string
  betAmount: number
  stakeAmount: number
  timestamp: Date
}

const DareSchema = new Schema<DareDocument>({
  dareNumber: {
    type: Number,
    required: [true, 'Dare number is required'],
    unique: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
  },
  title: {
    type: String,
    required: [true, 'Title is required']
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  betAmount: {
    type: Number,
    required: [true, 'Bet amount is required'],
    min: [0, 'Bet amount must be greater than 0']
  },
  stakeAmount: {
    type: Number,
    required: [true, 'Stake amount is required'],
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
})

DareSchema.pre<DareDocument>('validate', async function(next) {
  if (this.isNew) {
    const model = this.constructor as Model<DareDocument>
    const lastDare = await model.findOne().sort({ dareNumber: -1 })
    this.dareNumber = lastDare ? lastDare.dareNumber + 1 : 1
  }
  next()
})

const Dare = models.Dare || model<DareDocument>('Dare', DareSchema)

export default Dare
