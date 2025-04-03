import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("No code provided in the callback.");
  }

  res.status(200).send(`
    <h1>Authorization Code</h1>
    <p>Please copy this code and paste it into your terminal:</p>
    <pre>${code}</pre>
  `);
}