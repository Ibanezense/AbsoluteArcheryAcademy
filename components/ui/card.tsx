"use client"

import * as React from "react"

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={`bg-[#161a23] border border-white/10 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${className}`}
			{...props}
		/>
	)
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 border-b border-white/10 ${className}`} {...props} />
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 ${className}`} {...props} />
}

export function CardFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 border-t border-white/10 ${className}`} {...props} />
}

export default Card

