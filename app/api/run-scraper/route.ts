import { exec } from "child_process";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return new Promise((resolve) => {
    exec("python3 app/scrapers/logo/airline_loggers.py", { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        resolve(NextResponse.json({ error: error.message }, { status: 500 }));
        return;
      }
      if (stderr) {
        resolve(NextResponse.json({ error: stderr }, { status: 500 }));
        return;
      }
      resolve(NextResponse.json({ output: stdout }));
    });
  });
}