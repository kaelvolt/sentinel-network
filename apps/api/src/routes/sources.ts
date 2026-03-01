import { NextApiRequest, NextApiResponse } from 'next';

// Your route logic here
export default function handler(req: NextApiRequest, res: NextApiResponse) {
    // Implement your logic here
    res.status(200).json({ message: 'Sources route' });
}