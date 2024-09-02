import { NextRequest } from 'next/server'
import { ActionGetResponse, ActionPostRequest, ActionPostResponse, ACTIONS_CORS_HEADERS, createPostResponse, MEMO_PROGRAM_ID } from "@solana/actions"
import { Transaction, TransactionInstruction, PublicKey, ComputeBudgetProgram, Connection, clusterApiUrl, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { GoogleAuth, IdTokenClient } from 'google-auth-library'
import { connectToDB } from '@/utils/database'
import Dare from '@/models/dare'
import Submission from '@/models/submit'
import { BlinksightsClient } from 'blinksights-sdk'

const ADDRESS = new PublicKey("8LV3Rc6K3v1uLqEWoiar8VtJ8odtqw7LcvN2mxpfonRP")

const client = new BlinksightsClient(process.env.BLINKSIGHTS_API_KEY as string)

async function getIdentityToken(targetAudience: any) {
  const auth = new GoogleAuth()
  const client = await auth.getIdTokenClient(targetAudience)
  const idTokenClient = client

  const tokenResponse = await idTokenClient.getRequestHeaders()
  const identityToken = tokenResponse.Authorization?.split(' ')[1]

  if (!identityToken) {
    throw new Error('Failed to retrieve identity token.')
  }

  return identityToken
}

export const GET = async (req: NextRequest, { params }: { params: any }) => {
  await connectToDB()

  const dare = await Dare.findOne({ dareNumber: parseInt(params.number) })

  if (!dare) {
    const payload: ActionGetResponse = {
      icon: "https://blue-magnetic-wallaby-228.mypinata.cloud/ipfs/QmbmMN9i24taPpeT8BXRCzkh1SfvmMmYXotwyMQGUhdBTt",
      label: "Dare not found",
      title: "This dare hasn't been created yet!",
      description: "",
      disabled: true
    }

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    })
  }

  const fastApiIdentityToken = await getIdentityToken(FASTAPI_URL)

  const leaderboardResponse = await fetch(`${FASTAPI_URL}/leaderboard/${params.number}`, {
    headers: {
      'Authorization': `Bearer ${fastApiIdentityToken}`
    }
  })
  const leaderboardData = await leaderboardResponse.json()
  const icon = leaderboardData.image_url

  const payload: ActionGetResponse =  {
    icon,
    title: `${dare.title} | Win ${dare.betAmount} SEND`,
    label: dare.stakeAmount ? `Stake ${dare.stakeAmount} SOL` : 'Send',
    description: `\n${dare.description}\n\n-The tweet with the Maximum Impression wins🔥`,
    disabled: false,
    links: {
      actions: [
        {
          href: `${ACTION_URL}/dare/${dare.dareNumber}?tweet={tweet}`,
          label: dare.stakeAmount ? `Stake ${dare.stakeAmount} SOL` : 'Send',
          parameters: [
            {
              name: "tweet",
              label: "Submit Tweet Link 🐦",
              required: true
            }
          ]
        }
      ]
    }
  }
  const updatedPayload = await client.createActionGetResponseV2(req.url, payload)
  return Response.json(updatedPayload, {
    headers: ACTIONS_CORS_HEADERS,
  })
}

export const OPTIONS = GET

export const POST = async (req: NextRequest, { params }: { params: any }) => {
  await connectToDB()
  const dare = await Dare.findOne({ dareNumber: parseInt(params.number) })

  if (!dare) {
    return new Response(JSON.stringify({ error: "Dare not found" }), {
      status: 404,
      headers: ACTIONS_CORS_HEADERS
    })
  }

  try {
    const body = (await req.json()) as ActionPostRequest & {
      parameters: { name: string; value: string }[]
    }

    let account: PublicKey

    try {
      account = new PublicKey(body.account)
    } catch (err) {
      return new Response('Invalid account provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      })
    }

    console.log("Address:", account.toBase58())

    const tweetLink =  req.nextUrl.searchParams.get('tweet')
    console.log(tweetLink)

    if (!tweetLink) {
      return new Response('Tweet link is required', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      })
    }

    const submission = new Submission({
      dareNumber: dare.dareNumber,
      address: account.toBase58(),
      link: tweetLink,
    })

    await submission.save()
    
    await client.trackActionV2(account.toBase58(), req.url)
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    )

    const transaction = new Transaction()
    const rounded = Math.round((dare.stakeAmount * LAMPORTS_PER_SOL) * 100) / 100
    let blinksightsActionIdentityInstruction = await client.getActionIdentityInstructionV2(account.toBase58(), req.url)

    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000
      }),
      SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: ADDRESS,
        lamports: rounded
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from("blinkit", "utf-8"),
        keys: []
      })
    )
    if (blinksightsActionIdentityInstruction) {
      transaction.add(blinksightsActionIdentityInstruction)
    } else {
      console.warn("Proceeding without the action identity instruction as it couldn't be generated.")
    }

    transaction.feePayer = account
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: "The Dare is On!",
      },
    })

    console.log("MFING Payload: ", payload)
    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: "An unknown error occurred" }), {
      status: 500,
      headers: ACTIONS_CORS_HEADERS
    })
  }
}
