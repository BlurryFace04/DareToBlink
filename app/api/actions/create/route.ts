import { NextRequest } from 'next/server'
import { ActionGetResponse, ActionPostRequest, ActionPostResponse, ActionError, ACTIONS_CORS_HEADERS, createPostResponse, MEMO_PROGRAM_ID } from "@solana/actions"
import { Transaction, TransactionInstruction, PublicKey, ComputeBudgetProgram, Connection, clusterApiUrl, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js"
import { GoogleAuth, IdTokenClient } from 'google-auth-library'
import { connectToDB } from '@/utils/database'
import Dare from '@/models/dare'
import { BlinksightsClient } from 'blinksights-sdk'
import { TransactionMessage } from "@solana/web3.js"
import {
  NATIVE_MINT,
  createSyncNativeInstruction,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createCloseAccountInstruction,
  createTransferInstruction
} from "@solana/spl-token"

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

export const GET = async (req: Request) => {

  const payload: ActionGetResponse =  {
    icon: `https://blue-magnetic-wallaby-228.mypinata.cloud/ipfs/QmZbmeZF8hRaMjyzmN3khmvxdGenUMUPhn68YGMTnk5VYN`,
    title: "X Dares on Blinks",
    label: "Generate dare blink",
    description: "🚀Ignite social challenges:\n- Dare friends to tweet bold content\n- Wager on tweet hype and virality\n\nWill it go viral? Dare, tweet, win big! 🐦🔥",
    disabled: false,
    links: {
      actions: [
        {
          href: `${ACTION_URL}/create?title={title}&description={description}&replies={replies}&engagement={engagement}&betAmount={betAmount}`,
          label: "Generate dare blink",
          parameters: [
            {
              name: "title",
              label: "dare title",
              required: true
            },
            {
              name: "description",
              label: "dare description",
              required: true
            },
            {
              name: "betAmount",
              label: "bet amount (in sol)",
              required: true
            }
          ]
        }
      ]
    }
  }
  const updatedPayload = await client.createActionGetResponseV2(req.url, payload)

  return Response.json(updatedPayload, {
    headers: ACTIONS_CORS_HEADERS
  })
}

export const OPTIONS = GET

export const POST = async (req: NextRequest) => {
  await connectToDB()

  try {
    const body: ActionPostRequest = await req.json()

    let account: PublicKey

    try { 
      account = new PublicKey(body.account)
    } catch (err) {
      return new Response('Invalid account provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS
      })
    }

    console.log("Address:", account.toBase58())

    const title = req.nextUrl.searchParams.get('title')
    console.log("Title", title)
    const description = req.nextUrl.searchParams.get('description')
    console.log("Description", description)
    let betAmount = req.nextUrl.searchParams.get('betAmount')
    console.log("Bet amount before adjustment:", betAmount)

    // Ensure the bet amount is at least 0.001 SOL
    if (betAmount && parseFloat(betAmount) < 0.001) {
      betAmount = '0.001'
    }    

    console.log("Bet amount after adjustment:", betAmount)

    if (!title || !description || !betAmount) {
      return new Response('Missing required parameters', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS
      })
    }
    await client.trackActionV2(account.toBase58(), req.url)

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`)
    let blinksightsActionIdentityInstruction = await client.getActionIdentityInstructionV2(account.toBase58(), req.url)

    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1_000_000 * 1,
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from("dare to blink", "utf-8"),
        keys: []
      })
    )

    const sendcoinMintAddress = new PublicKey('SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa')
    const amountInLamports = Math.round((parseFloat(betAmount) * LAMPORTS_PER_SOL) * 100) / 100

    const ATA_WSOL = await getAssociatedTokenAddress(NATIVE_MINT, account)
    console.log("Wrapped Sol ATA", ATA_WSOL.toBase58())

    const ATA_SEND = await getAssociatedTokenAddress(sendcoinMintAddress, account)
    console.log("Send Sol ATA", ATA_SEND.toBase58())

    const WSOL_Info = await connection.getAccountInfo(ATA_WSOL)
    const SEND_Info = await connection.getAccountInfo(ATA_SEND)

    if (!WSOL_Info) {
      console.log(`Wrapped SOL ATA Doesn't exist. Creating one now...`)
      const ATAIx = createAssociatedTokenAccountInstruction(
        account,
        ATA_WSOL,
        account,
        NATIVE_MINT
      )
      transaction.add(ATAIx)
    }

    if (!SEND_Info) {
      console.log(`Send ATA Doesn't exist. Creating one now...`)
      const ATAIx = createAssociatedTokenAccountInstruction(
        account,
        ATA_SEND,
        account,
        sendcoinMintAddress
      )
      transaction.add(ATAIx)
    }

    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa\
&amount=${amountInLamports}\
&slippageBps=100`)
    ).json()

    console.log({ quoteResponse })

    const outAmount = quoteResponse.outAmount
    const outAmountThreshold = quoteResponse.otherAmountThreshold

    // Get serialized transactions for the swap
    const instructions = await (
      await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: account.toString(),
          dynamicComputeUnitLimit: true
        })
      })
    ).json()

    if (instructions.error) {
      throw new Error("Failed to get swap instructions: " + instructions.error)
    }

    const { swapInstruction: swapInstructionPayload } = instructions

    const deserializeInstruction = (instruction: any) => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
      })
    }

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: ATA_WSOL,
        lamports: amountInLamports,
      }),
      createSyncNativeInstruction(ATA_WSOL),
      deserializeInstruction(swapInstructionPayload)
    )

    if (!WSOL_Info) {
      transaction.add(
        createCloseAccountInstruction(
          ATA_WSOL,
          account,
          account
        )
      )
    }

    const ADMIN_SEND_ATA = await getAssociatedTokenAddress( sendcoinMintAddress, ADDRESS )

    const roundedOutAmountThreshold = Math.floor(outAmountThreshold / 10**6) * 10**6

    transaction.add(
      createTransferInstruction(
        ATA_SEND,
        ADMIN_SEND_ATA,
        account,
        roundedOutAmountThreshold
      )
    )

    if (blinksightsActionIdentityInstruction) {
      transaction.add(blinksightsActionIdentityInstruction)
    } else {
      console.warn("Proceeding without the action identity instruction as it couldn't be generated.")
    }

    transaction.feePayer = account
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

    const adjustedBetAmount = Math.floor(outAmountThreshold / 10 ** 6)
    const adjustedStakeAmount = parseFloat(betAmount) >= 0.069 ? 0.0069 : 0

    const dare = new Dare({
      address: account.toBase58(),
      title,
      description,
      betAmount: adjustedBetAmount,
      stakeAmount: adjustedStakeAmount
    })
    await dare.save()
    const stringDare = JSON.stringify(dare)

    const mailIdentityToken = await getIdentityToken(MAIL_URL)

    const response = await fetch(`${MAIL_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mailIdentityToken}`
      },
      body: JSON.stringify({ subject: 'new dare received for x dares on blinks', text: stringDare })
    })
    const responseData = await response.json()
    const { success } = responseData
    console.log('Mail sent:', success)

    const action = `solana-action:https://xdares.catoff.xyz/api/actions/dare/${dare.dareNumber}`

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Copy the blink and post it on X ➡️ \nhttps://dial.to/?action=${action}`,
      },
    })

    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })
  } catch (err) {
    console.error(err)
    return Response.json("An unknown error occured", { status: 500 })
  }
}
