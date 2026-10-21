"use client"

import * as React from "react"

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={`surface-panel text-textpri ${className}`}
			{...props}
		/>
	)
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 border-b border-line ${className}`} {...props} />
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 ${className}`} {...props} />
}

export function CardFooter({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={`p-6 border-t border-line ${className}`} {...props} />
}

export default Card

